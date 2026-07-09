import { hashPassword } from "@/lib/security/password";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { FORMAS_PAGAMENTO_PADRAO } from "@/domains/finance/application/payment-config-use-cases";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { AmbienteFiscal, ProvedorFiscal } from "@prisma/client";
import { encryptSecret, secretLastChars } from "@/lib/security/secret-crypto";
import { PROVEDORES_FISCAIS, defaultBaseUrl, getProvedorFiscalAtivo, getCredenciaisProvedorPlataforma, provedorCred } from "@/domains/fiscal/application/plataforma-provedor-use-cases";
import { resolveFiscalProvider } from "@/domains/fiscal/providers";
import { formatBrl } from "@/lib/formatters/currency";
import { PERFIS_PADRAO, TODOS_MODULOS, isAdminPerfil, type ModuloKey } from "@/lib/auth/modules";
import { TENANT_FEATURE_FLAGS, type TenantFeatureKey, type TenantFeatures } from "@/lib/auth/feature-flags";

/**
 * Camada de serviço do PAINEL DA PLATAFORMA (dono do SaaS).
 *
 * Diferente do restante do ERP, este módulo NÃO é escopado por tenant: o dono da
 * plataforma enxerga todos os clientes. Toda função pública exige `requirePlatformAdmin()`
 * (lança se o usuário não for dono da plataforma) e registra auditoria das ações sensíveis.
 *
 * Aqui um "cliente" do SaaS = um Tenant (conta contratante), que contém uma ou mais
 * empresas (CNPJs). Bloquear o tenant trava o login de todos os usuários do cliente.
 */

export class PlatformAdminError extends Error {}

function assertDb() {
  if (!process.env.DATABASE_URL) {
    throw new PlatformAdminError("DATABASE_URL não configurada. Configure o banco de dados.");
  }
}

/** Registra uma ação do painel da plataforma na auditoria do tenant alvo. */
async function audit(input: {
  tenantId: string;
  empresaId?: string | null;
  usuarioId: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  payload?: Record<string, unknown>;
}) {
  await prisma.auditoria
    .create({
      data: {
        tenantId: input.tenantId,
        empresaId: input.empresaId ?? null,
        usuarioId: input.usuarioId,
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        acao: input.acao,
        payload: (input.payload ?? {}) as object
      }
    })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export type PlatformMetrics = {
  totalTenants: number;
  tenantsAtivos: number;
  tenantsBloqueados: number;
  totalEmpresas: number;
  empresasAtivas: number;
  empresasBloqueadas: number;
  totalUsuarios: number;
  usuariosAtivos: number;
  notasAutorizadas30d: number;
  notasComProblema: number;
};

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  await requirePlatformAdmin();
  assertDb();

  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalTenants,
    tenantsAtivos,
    totalEmpresas,
    empresasAtivas,
    empresasBloqueadas,
    totalUsuarios,
    usuariosAtivos,
    notasAutorizadas30d,
    notasComProblema
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { ativo: true } }),
    prisma.empresa.count(),
    prisma.empresa.count({ where: { status: "ATIVA" } }),
    prisma.empresa.count({ where: { status: "BLOQUEADA" } }),
    prisma.usuario.count(),
    prisma.usuario.count({ where: { status: "ATIVO" } }),
    prisma.notaFiscal.count({ where: { status: "AUTORIZADA", criadoEm: { gte: trintaDiasAtras } } }),
    prisma.notaFiscal.count({ where: { status: { in: ["REJEITADA", "DENEGADA", "ERRO"] } } })
  ]);

  return {
    totalTenants,
    tenantsAtivos,
    tenantsBloqueados: totalTenants - tenantsAtivos,
    totalEmpresas,
    empresasAtivas,
    empresasBloqueadas,
    totalUsuarios,
    usuariosAtivos,
    notasAutorizadas30d,
    notasComProblema
  };
}

// ---------------------------------------------------------------------------
// Listagem / detalhe de clientes (tenants)
// ---------------------------------------------------------------------------

export type ClienteSummary = {
  id: string;
  nome: string;
  /** Razão social da empresa matriz (ou a primeira) — nome "de verdade" do cliente. */
  razaoSocial: string | null;
  slug: string;
  ativo: boolean;
  statusLabel: string;
  statusTone: "success" | "danger";
  totalEmpresas: number;
  empresasBloqueadas: number;
  totalUsuarios: number;
  ultimoAcessoEm: string | null;
  criadoEm: string;
};

export async function listClientes(): Promise<ClienteSummary[]> {
  await requirePlatformAdmin();
  assertDb();

  const tenants = await prisma.tenant.findMany({
    orderBy: { criadoEm: "desc" },
    include: {
      empresas: { select: { status: true, razaoSocial: true, nomeFantasia: true, matriz: true } },
      _count: { select: { empresas: true, vinculos: true } }
    }
  });

  // Último acesso por tenant: o maior ultimoAcessoEm entre os usuários vinculados.
  const ultimoAcessoPorTenant = new Map<string, Date | null>();
  for (const t of tenants) {
    const vinc = await prisma.usuarioVinculo.findMany({
      where: { tenantId: t.id },
      select: { usuario: { select: { ultimoAcessoEm: true } } }
    });
    const datas = vinc
      .map((v) => v.usuario.ultimoAcessoEm)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime());
    ultimoAcessoPorTenant.set(t.id, datas[0] ?? null);
  }

  return tenants.map((t) => ({
    id: t.id,
    nome: t.nome,
    razaoSocial: (t.empresas.find((e) => e.matriz) ?? t.empresas[0])?.razaoSocial ?? null,
    slug: t.slug,
    ativo: t.ativo,
    statusLabel: t.ativo ? "Ativo" : "Bloqueado",
    statusTone: t.ativo ? ("success" as const) : ("danger" as const),
    totalEmpresas: t._count.empresas,
    empresasBloqueadas: t.empresas.filter((e) => e.status === "BLOQUEADA").length,
    totalUsuarios: t._count.vinculos,
    ultimoAcessoEm: ultimoAcessoPorTenant.get(t.id)?.toISOString() ?? null,
    criadoEm: t.criadoEm.toISOString()
  }));
}

export type ClienteDetail = {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  /** Plano comercial (COMPLETO | EMISSOR) + fim do trial (null = sem trial). */
  plano: string;
  trialFimEm: string | null;
  lojaHabilitada: boolean;
  iaHabilitada: boolean;
  spedFiscalHabilitado: boolean;
  expedicaoHabilitada: boolean;
  /** Todas as flags de módulo por tenant (inclui as 4 acima) para os toggles do painel. */
  features: TenantFeatures;
  criadoEm: string;
  empresas: {
    id: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string;
    status: string;
    statusLabel: string;
    statusTone: "success" | "warn" | "danger" | "mute";
    matriz: boolean;
    exigir2fa: boolean;
    cidade: string | null;
    uf: string | null;
  }[];
  usuarios: {
    id: string;
    nome: string;
    email: string;
    status: string;
    ativo: boolean;
    perfis: string[];
    plataformaAdmin: boolean;
    ultimoAcessoEm: string | null;
  }[];
};

function empresaStatusLabel(status: string): string {
  const labels: Record<string, string> = { ATIVA: "Ativa", INATIVA: "Inativa", BLOQUEADA: "Bloqueada" };
  return labels[status] ?? status;
}

function empresaStatusTone(status: string): "success" | "warn" | "danger" | "mute" {
  if (status === "ATIVA") return "success";
  if (status === "BLOQUEADA") return "danger";
  if (status === "INATIVA") return "mute";
  return "warn";
}

export async function getClienteDetail(tenantId: string): Promise<ClienteDetail | null> {
  await requirePlatformAdmin();
  assertDb();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      empresas: { orderBy: [{ matriz: "desc" }, { razaoSocial: "asc" }] },
      vinculos: {
        include: {
          usuario: { select: { id: true, nome: true, email: true, status: true, plataformaAdmin: true, ultimoAcessoEm: true } },
          perfil: { select: { nome: true } }
        }
      }
    }
  });
  if (!tenant) return null;

  // Agrupa vínculos por usuário (um usuário pode ter vários perfis no tenant).
  const usuariosMap = new Map<string, ClienteDetail["usuarios"][number]>();
  for (const v of tenant.vinculos) {
    const u = v.usuario;
    const existing = usuariosMap.get(u.id);
    if (existing) {
      if (!existing.perfis.includes(v.perfil.nome)) existing.perfis.push(v.perfil.nome);
      if (v.ativo) existing.ativo = true;
    } else {
      usuariosMap.set(u.id, {
        id: u.id,
        nome: u.nome,
        email: u.email,
        status: u.status,
        ativo: v.ativo,
        perfis: [v.perfil.nome],
        plataformaAdmin: u.plataformaAdmin,
        ultimoAcessoEm: u.ultimoAcessoEm?.toISOString() ?? null
      });
    }
  }

  return {
    id: tenant.id,
    nome: tenant.nome,
    slug: tenant.slug,
    ativo: tenant.ativo,
    plano: tenant.plano,
    trialFimEm: tenant.trialFimEm?.toISOString() ?? null,
    lojaHabilitada: tenant.lojaHabilitada,
    iaHabilitada: tenant.iaHabilitada,
    spedFiscalHabilitado: tenant.spedFiscalHabilitado,
    expedicaoHabilitada: tenant.expedicaoHabilitada,
    features: Object.fromEntries(
      TENANT_FEATURE_FLAGS.map((f) => [f, (tenant as unknown as Record<string, boolean>)[f] ?? true])
    ) as TenantFeatures,
    criadoEm: tenant.criadoEm.toISOString(),
    empresas: tenant.empresas.map((e) => ({
      id: e.id,
      razaoSocial: e.razaoSocial,
      nomeFantasia: e.nomeFantasia,
      cnpj: e.cnpj,
      status: e.status,
      statusLabel: empresaStatusLabel(e.status),
      statusTone: empresaStatusTone(e.status),
      matriz: e.matriz,
      exigir2fa: e.exigir2fa,
      cidade: e.enderecoCidade,
      uf: e.enderecoUf
    })),
    usuarios: Array.from(usuariosMap.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  };
}

// ---------------------------------------------------------------------------
// Plano comercial + trial
// ---------------------------------------------------------------------------

/**
 * Define o PLANO comercial do cliente e aplica o preset de módulos correspondente:
 * EMISSOR = só emissão fiscal (NF-e/NFS-e + cadastros); COMPLETO = religa os módulos de série.
 * É o mesmo sistema — upgrade/downgrade a qualquer momento.
 */
export async function setTenantPlano(tenantId: string, plano: "COMPLETO" | "EMISSOR") {
  const admin = await requirePlatformAdmin();
  assertDb();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, plano: true } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");
  const { PRESET_FLAGS_EMISSOR, PRESET_FLAGS_COMPLETO } = await import("@/lib/auth/feature-flags");
  const preset = plano === "EMISSOR" ? PRESET_FLAGS_EMISSOR : PRESET_FLAGS_COMPLETO;
  const atualizado = await prisma.tenant.update({ where: { id: tenantId }, data: { plano, ...preset } });
  await audit({
    tenantId,
    usuarioId: admin.usuarioId,
    entidade: "Tenant",
    entidadeId: tenantId,
    acao: "plataforma.definir_plano",
    payload: { planoAnterior: tenant.plano, planoNovo: plano }
  });
  return { id: atualizado.id, plano: atualizado.plano };
}

/** Define/estende/remove o TRIAL do cliente. dias=null limpa (vira assinante sem prazo). */
export async function setTenantTrial(tenantId: string, dias: number | null) {
  const admin = await requirePlatformAdmin();
  assertDb();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, trialFimEm: true } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");
  const trialFimEm = dias == null ? null : new Date(Date.now() + Math.max(1, Math.floor(dias)) * 86400000);
  const atualizado = await prisma.tenant.update({ where: { id: tenantId }, data: { trialFimEm } });
  await audit({
    tenantId,
    usuarioId: admin.usuarioId,
    entidade: "Tenant",
    entidadeId: tenantId,
    acao: "plataforma.definir_trial",
    payload: { anterior: tenant.trialFimEm?.toISOString() ?? null, novo: trialFimEm?.toISOString() ?? null }
  });
  return { id: atualizado.id, trialFimEm: atualizado.trialFimEm };
}

// ---------------------------------------------------------------------------
// Liberar / bloquear cliente
// ---------------------------------------------------------------------------

export async function setTenantAtivo(tenantId: string, ativo: boolean) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");

  const atualizado = await prisma.tenant.update({ where: { id: tenantId }, data: { ativo } });

  // Ao bloquear o tenant, encerra as sessões ativas de todos os seus usuários
  // (exceto donos da plataforma), travando o acesso imediatamente.
  if (!ativo) {
    await prisma.sessao
      .deleteMany({ where: { tenantId, usuario: { plataformaAdmin: false } } })
      .catch(() => undefined);
  }

  await audit({
    tenantId,
    usuarioId: admin.usuarioId,
    entidade: "Tenant",
    entidadeId: tenantId,
    acao: ativo ? "plataforma.liberar_cliente" : "plataforma.bloquear_cliente",
    payload: { ativoAnterior: tenant.ativo, ativoNovo: ativo }
  });

  return { id: atualizado.id, ativo: atualizado.ativo };
}

export async function setTenantLojaHabilitada(tenantId: string, habilitada: boolean) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");

  const atualizado = await prisma.tenant.update({ where: { id: tenantId }, data: { lojaHabilitada: habilitada } });

  await audit({
    tenantId,
    usuarioId: admin.usuarioId,
    entidade: "Tenant",
    entidadeId: tenantId,
    acao: habilitada ? "plataforma.habilitar_loja" : "plataforma.desabilitar_loja",
    payload: { lojaHabilitadaAnterior: tenant.lojaHabilitada, lojaHabilitadaNova: habilitada }
  });

  return { id: atualizado.id, lojaHabilitada: atualizado.lojaHabilitada };
}

/**
 * Resolve o escopo (tenant/empresa) de uma empresa de um cliente, validando que ela pertence ao
 * cliente e que o requisitante é dono da plataforma. Usado para o dono do SaaS operar a config
 * fiscal (onboarding, certificado, teste) DA empresa do cliente, reusando os use-cases fiscais.
 */
export async function resolveEmpresaScope(tenantId: string, empresaId: string): Promise<TenantScope> {
  await requirePlatformAdmin();
  assertDb();
  const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, tenantId }, select: { id: true } });
  if (!empresa) throw new PlatformAdminError("Empresa não encontrada para este cliente.");
  return { tenantId, empresaId };
}

/** Habilita/desabilita o módulo de IA do cliente (gate do dono do SaaS). */
export async function setTenantIaHabilitada(tenantId: string, habilitada: boolean) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");

  const atualizado = await prisma.tenant.update({ where: { id: tenantId }, data: { iaHabilitada: habilitada } });

  await audit({
    tenantId,
    usuarioId: admin.usuarioId,
    entidade: "Tenant",
    entidadeId: tenantId,
    acao: habilitada ? "plataforma.habilitar_ia" : "plataforma.desabilitar_ia",
    payload: { iaHabilitadaAnterior: tenant.iaHabilitada, iaHabilitadaNova: habilitada }
  });

  return { id: atualizado.id, iaHabilitada: atualizado.iaHabilitada };
}

/** Habilita/desabilita o módulo SPED Fiscal (EFD ICMS/IPI) do cliente (gate do dono do SaaS). */
export async function setTenantSpedFiscalHabilitado(tenantId: string, habilitado: boolean) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");

  const atualizado = await prisma.tenant.update({ where: { id: tenantId }, data: { spedFiscalHabilitado: habilitado } });

  await audit({
    tenantId,
    usuarioId: admin.usuarioId,
    entidade: "Tenant",
    entidadeId: tenantId,
    acao: habilitado ? "plataforma.habilitar_sped_fiscal" : "plataforma.desabilitar_sped_fiscal",
    payload: { spedFiscalHabilitadoAnterior: tenant.spedFiscalHabilitado, spedFiscalHabilitadoNovo: habilitado }
  });

  return { id: atualizado.id, spedFiscalHabilitado: atualizado.spedFiscalHabilitado };
}

/** Habilita/desabilita o módulo Expedição (recibo de retirada) do cliente (gate do dono do SaaS). */
export async function setTenantExpedicaoHabilitada(tenantId: string, habilitada: boolean) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");

  const atualizado = await prisma.tenant.update({ where: { id: tenantId }, data: { expedicaoHabilitada: habilitada } });

  await audit({
    tenantId,
    usuarioId: admin.usuarioId,
    entidade: "Tenant",
    entidadeId: tenantId,
    acao: habilitada ? "plataforma.habilitar_expedicao" : "plataforma.desabilitar_expedicao",
    payload: { expedicaoHabilitadaAnterior: tenant.expedicaoHabilitada, expedicaoHabilitadaNova: habilitada }
  });

  return { id: atualizado.id, expedicaoHabilitada: atualizado.expedicaoHabilitada };
}

/**
 * Liga/desliga uma flag de módulo do tenant (gate genérico do dono do SaaS). A coluna é validada
 * contra a whitelist TENANT_FEATURE_FLAGS — nunca grava um nome de coluna arbitrário.
 */
export async function setTenantModulo(tenantId: string, flag: TenantFeatureKey, habilitado: boolean) {
  const admin = await requirePlatformAdmin();
  assertDb();
  if (!TENANT_FEATURE_FLAGS.includes(flag)) throw new PlatformAdminError("Módulo inválido.");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");

  const anterior = (tenant as unknown as Record<string, boolean>)[flag];
  const atualizado = await prisma.tenant.update({ where: { id: tenantId }, data: { [flag]: habilitado } });

  await audit({
    tenantId,
    usuarioId: admin.usuarioId,
    entidade: "Tenant",
    entidadeId: tenantId,
    acao: habilitado ? `plataforma.habilitar_modulo.${flag}` : `plataforma.desabilitar_modulo.${flag}`,
    payload: { flag, anterior, novo: habilitado }
  });

  return { id: atualizado.id, flag, habilitado: (atualizado as unknown as Record<string, boolean>)[flag] };
}

/** Edita o nome e/ou o slug (identificador) do cliente (tenant). Slug único entre clientes. */
export async function updateCliente(tenantId: string, input: { nome?: string; slug?: string }) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");

  const nome = input.nome?.trim();
  const slug = input.slug != null ? slugify(input.slug) : undefined;
  if (input.nome != null && !nome) throw new PlatformAdminError("Informe o nome do cliente.");
  if (input.slug != null && (!slug || slug.length < 2)) {
    throw new PlatformAdminError("Slug inválido — use ao menos 2 caracteres (letras, números e hífen).");
  }
  if (slug && slug !== tenant.slug) {
    const existe = await prisma.tenant.findUnique({ where: { slug } });
    if (existe) throw new PlatformAdminError(`O identificador "${slug}" já está em uso por outro cliente.`);
  }

  const atualizado = await prisma.tenant.update({
    where: { id: tenantId },
    data: { ...(nome ? { nome } : {}), ...(slug ? { slug } : {}) }
  });

  await audit({
    tenantId,
    usuarioId: admin.usuarioId,
    entidade: "Tenant",
    entidadeId: tenantId,
    acao: "plataforma.editar_cliente",
    payload: { nomeAnterior: tenant.nome, nomeNovo: atualizado.nome, slugAnterior: tenant.slug, slugNovo: atualizado.slug }
  });

  return { id: atualizado.id, nome: atualizado.nome, slug: atualizado.slug };
}

export async function setEmpresaStatus(empresaId: string, status: "ATIVA" | "INATIVA" | "BLOQUEADA") {
  const admin = await requirePlatformAdmin();
  assertDb();

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) throw new PlatformAdminError("Empresa não encontrada.");

  const atualizada = await prisma.empresa.update({ where: { id: empresaId }, data: { status } });

  if (status !== "ATIVA") {
    await prisma.sessao
      .deleteMany({ where: { empresaId, usuario: { plataformaAdmin: false } } })
      .catch(() => undefined);
  }

  await audit({
    tenantId: empresa.tenantId,
    empresaId,
    usuarioId: admin.usuarioId,
    entidade: "Empresa",
    entidadeId: empresaId,
    acao: "plataforma.alterar_status_empresa",
    payload: { statusAnterior: empresa.status, statusNovo: status }
  });

  return { id: atualizada.id, status: atualizada.status };
}

/** Liga/desliga a exigência de 2FA (código WhatsApp) no login dos usuários da empresa. */
export async function setEmpresaExigir2fa(empresaId: string, exigir: boolean) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) throw new PlatformAdminError("Empresa não encontrada.");

  const atualizada = await prisma.empresa.update({ where: { id: empresaId }, data: { exigir2fa: exigir } });
  await audit({
    tenantId: empresa.tenantId,
    empresaId,
    usuarioId: admin.usuarioId,
    entidade: "Empresa",
    entidadeId: empresaId,
    acao: "plataforma.alterar_2fa_empresa",
    payload: { exigir2fa: exigir }
  });
  return { id: atualizada.id, exigir2fa: atualizada.exigir2fa };
}

// ---------------------------------------------------------------------------
// Provisionar novo cliente
// ---------------------------------------------------------------------------

export type CriarClienteInput = {
  nomeCliente: string;
  slug?: string;
  razaoSocial: string;
  nomeFantasia?: string;
  cnpj: string;
  adminNome: string;
  adminEmail: string;
  senhaInicial?: string;
};

export type CriarClienteResult = {
  tenantId: string;
  empresaId: string;
  usuarioId: string;
  adminEmail: string;
  senhaInicial: string;
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

/** Senha temporária forte (legível) para o primeiro acesso do admin do cliente. */
function gerarSenhaTemporaria(): string {
  const base = Math.random().toString(36).slice(2, 8);
  const num = Math.floor(1000 + Math.random() * 9000);
  return `Jr-${base}-${num}`;
}

export async function criarCliente(input: CriarClienteInput): Promise<CriarClienteResult> {
  const admin = await requirePlatformAdmin();
  assertDb();

  const nomeCliente = input.nomeCliente?.trim();
  const razaoSocial = input.razaoSocial?.trim();
  const cnpj = input.cnpj?.trim();
  const adminNome = input.adminNome?.trim();
  const adminEmail = input.adminEmail?.trim().toLowerCase();

  if (!nomeCliente || !razaoSocial || !cnpj || !adminNome || !adminEmail) {
    throw new PlatformAdminError("Preencha nome do cliente, razão social, CNPJ, nome e e-mail do administrador.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    throw new PlatformAdminError("E-mail do administrador inválido.");
  }

  const slugBase = slugify(input.slug?.trim() || nomeCliente);
  if (!slugBase) throw new PlatformAdminError("Não foi possível gerar um identificador (slug) para o cliente.");

  const emailExistente = await prisma.usuario.findUnique({ where: { email: adminEmail } });
  if (emailExistente) throw new PlatformAdminError(`Já existe um usuário com o e-mail ${adminEmail}.`);

  // Garante slug único (sufixa -2, -3, ... se necessário).
  let slug = slugBase;
  for (let i = 2; await prisma.tenant.findUnique({ where: { slug } }); i++) {
    slug = `${slugBase}-${i}`;
  }

  const senhaInicial = input.senhaInicial?.trim() || gerarSenhaTemporaria();
  if (senhaInicial.length < 8) throw new PlatformAdminError("A senha inicial deve ter ao menos 8 caracteres.");

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { nome: nomeCliente, slug } });

    const empresa = await tx.empresa.create({
      data: {
        tenantId: tenant.id,
        razaoSocial,
        nomeFantasia: input.nomeFantasia?.trim() || null,
        cnpj,
        matriz: true,
        status: "ATIVA"
      }
    });

    // Formas de pagamento padrão (o cliente pode editar/excluir depois).
    await tx.formaPagamento.createMany({
      data: FORMAS_PAGAMENTO_PADRAO.map((f) => ({ tenantId: tenant.id, empresaId: empresa.id, nome: f.nome, tipo: f.tipo, ordem: f.ordem, ativo: true }))
    });

    // Perfis padrão (RBAC por módulo) do novo tenant.
    let superAdminPerfilId = "";
    for (const def of PERFIS_PADRAO) {
      const perfil = await tx.perfil.create({
        data: { tenantId: tenant.id, nome: def.nome, descricao: def.descricao }
      });
      if (def.nome === "SUPER_ADMIN") superAdminPerfilId = perfil.id;
      const modulos: ModuloKey[] = def.modulos === "*" ? [...TODOS_MODULOS] : def.modulos;
      await tx.permissao.createMany({
        data: modulos.map((modulo) => ({ tenantId: tenant.id, perfilId: perfil.id, modulo, acao: "acessar" }))
      });
    }

    const usuario = await tx.usuario.create({
      data: { nome: adminNome, email: adminEmail, senhaHash: hashPassword(senhaInicial), status: "ATIVO" }
    });

    await tx.usuarioVinculo.create({
      data: { tenantId: tenant.id, empresaId: empresa.id, usuarioId: usuario.id, perfilId: superAdminPerfilId, ativo: true }
    });

    await tx.auditoria.create({
      data: {
        tenantId: tenant.id,
        empresaId: empresa.id,
        usuarioId: admin.usuarioId,
        entidade: "Tenant",
        entidadeId: tenant.id,
        acao: "plataforma.criar_cliente",
        payload: { slug, razaoSocial, cnpj, adminEmail }
      }
    });

    return { tenantId: tenant.id, empresaId: empresa.id, usuarioId: usuario.id };
  });

  return { ...result, adminEmail, senhaInicial };
}

// ---------------------------------------------------------------------------
// Resetar senha de usuário de um cliente
// ---------------------------------------------------------------------------

export type ResetarSenhaResult = { usuarioId: string; email: string; senhaInicial: string };

export async function resetarSenhaUsuario(usuarioId: string, novaSenha?: string): Promise<ResetarSenhaResult> {
  const admin = await requirePlatformAdmin();
  assertDb();

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new PlatformAdminError("Usuário não encontrado.");

  const senhaInicial = novaSenha?.trim() || gerarSenhaTemporaria();
  if (senhaInicial.length < 8) throw new PlatformAdminError("A senha deve ter ao menos 8 caracteres.");

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { senhaHash: hashPassword(senhaInicial), status: "ATIVO" }
  });
  // Encerra sessões existentes do usuário (a senha mudou).
  await prisma.sessao.deleteMany({ where: { usuarioId } }).catch(() => undefined);

  // Auditoria no tenant do primeiro vínculo do usuário (quando houver).
  const vinculo = await prisma.usuarioVinculo.findFirst({ where: { usuarioId }, orderBy: { criadoEm: "asc" } });
  if (vinculo) {
    await audit({
      tenantId: vinculo.tenantId,
      empresaId: vinculo.empresaId,
      usuarioId: admin.usuarioId,
      entidade: "Usuario",
      entidadeId: usuarioId,
      acao: "plataforma.resetar_senha",
      payload: { email: usuario.email }
    });
  }

  return { usuarioId, email: usuario.email, senhaInicial };
}

// ---------------------------------------------------------------------------
// Monitoramento de emissões fiscais (NF-e / NFC-e / NFS-e) de todos os clientes
// ---------------------------------------------------------------------------

export type EmissaoFiscalFiltro = {
  status?: string;
  modelo?: string;
  tenantId?: string;
  busca?: string;
  limite?: number;
};

export type EmissaoFiscalRow = {
  id: string;
  tenantId: string;
  tenantNome: string;
  empresaId: string;
  empresaNome: string;
  modelo: string;
  numero: string | null;
  serie: string | null;
  status: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "info" | "mute";
  ambiente: string;
  provedor: string;
  destinatario: string | null;
  valorTotal: string;
  motivo: string | null;
  emitidaEm: string | null;
  criadoEm: string;
};

export type EmissoesFiscaisResultado = {
  itens: EmissaoFiscalRow[];
  resumo: { autorizadas: number; processando: number; comProblema: number; canceladas: number; total: number };
};

const NOTA_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PROCESSANDO: "Processando",
  AUTORIZADA: "Autorizada",
  CANCELADA: "Cancelada",
  REJEITADA: "Rejeitada",
  DENEGADA: "Denegada",
  ERRO: "Erro"
};

function notaStatusTone(status: string): EmissaoFiscalRow["statusTone"] {
  if (status === "AUTORIZADA") return "success";
  if (status === "PROCESSANDO") return "info";
  if (status === "CANCELADA") return "warn";
  if (status === "REJEITADA" || status === "DENEGADA" || status === "ERRO") return "danger";
  return "mute";
}

const STATUS_VALIDOS = ["RASCUNHO", "PROCESSANDO", "AUTORIZADA", "CANCELADA", "REJEITADA", "DENEGADA", "ERRO"];
const MODELOS_VALIDOS = ["NFE", "NFCE", "NFSE"];

export async function listEmissoesFiscais(filtro: EmissaoFiscalFiltro = {}): Promise<EmissoesFiscaisResultado> {
  await requirePlatformAdmin();
  assertDb();

  const where: Record<string, unknown> = {};
  if (filtro.status && STATUS_VALIDOS.includes(filtro.status)) where.status = filtro.status;
  if (filtro.modelo && MODELOS_VALIDOS.includes(filtro.modelo)) where.modelo = filtro.modelo;
  if (filtro.tenantId) where.tenantId = filtro.tenantId;
  if (filtro.busca?.trim()) {
    const q = filtro.busca.trim();
    where.OR = [
      { numero: { contains: q } },
      { chaveAcesso: { contains: q } },
      { destinatarioNome: { contains: q, mode: "insensitive" } },
      { destinatarioDocumento: { contains: q } }
    ];
  }

  const limite = Math.min(Math.max(filtro.limite ?? 100, 1), 500);

  // Mapa de nome do tenant por empresa, para exibir o cliente sem N+1 por linha.
  const [notas, tenants] = await Promise.all([
    prisma.notaFiscal.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: limite,
      include: { empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true, tenantId: true } } }
    }),
    prisma.tenant.findMany({ select: { id: true, nome: true } })
  ]);

  const tenantNomePorId = new Map(tenants.map((t) => [t.id, t.nome]));

  const itens: EmissaoFiscalRow[] = notas.map((n) => ({
    id: n.id,
    tenantId: n.tenantId,
    tenantNome: tenantNomePorId.get(n.tenantId) ?? "—",
    empresaId: n.empresaId,
    empresaNome: n.empresa?.nomeFantasia || n.empresa?.razaoSocial || "—",
    modelo: n.modelo,
    numero: n.numero,
    serie: n.serie,
    status: n.status,
    statusLabel: NOTA_STATUS_LABEL[n.status] ?? n.status,
    statusTone: notaStatusTone(n.status),
    ambiente: n.ambiente === "PRODUCAO" ? "Produção" : "Homologação",
    provedor: n.provedor,
    destinatario: n.destinatarioNome,
    valorTotal: formatBrl(Number(n.total)),
    motivo: n.motivo,
    emitidaEm: n.emitidaEm?.toISOString() ?? null,
    criadoEm: n.criadoEm.toISOString()
  }));

  // Resumo (sobre o conjunto filtrado, independentemente do limite de linhas).
  const [autorizadas, processando, comProblema, canceladas, total] = await Promise.all([
    prisma.notaFiscal.count({ where: { ...where, status: "AUTORIZADA" } }),
    prisma.notaFiscal.count({ where: { ...where, status: "PROCESSANDO" } }),
    prisma.notaFiscal.count({ where: { ...where, status: { in: ["REJEITADA", "DENEGADA", "ERRO"] } } }),
    prisma.notaFiscal.count({ where: { ...where, status: "CANCELADA" } }),
    prisma.notaFiscal.count({ where })
  ]);

  return { itens, resumo: { autorizadas, processando, comProblema, canceladas, total } };
}

export type ClienteOption = { id: string; nome: string };

export async function listClienteOptions(): Promise<ClienteOption[]> {
  await requirePlatformAdmin();
  assertDb();
  const tenants = await prisma.tenant.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  return tenants.map((t) => ({ id: t.id, nome: t.nome }));
}

// ---------------------------------------------------------------------------
// Gestão global de usuários
// ---------------------------------------------------------------------------

export type UsuarioVinculoInfo = {
  clienteId: string;
  clienteNome: string;
  empresaNome: string | null;
  perfilNome: string;
  ativo: boolean;
};

export type UsuarioRow = {
  id: string;
  nome: string;
  email: string;
  status: "ATIVO" | "INATIVO";
  plataformaAdmin: boolean;
  ultimoAcessoEm: string | null;
  criadoEm: string;
  vinculos: UsuarioVinculoInfo[];
};

export async function listUsuarios(): Promise<UsuarioRow[]> {
  await requirePlatformAdmin();
  assertDb();

  const usuarios = await prisma.usuario.findMany({
    orderBy: [{ plataformaAdmin: "desc" }, { nome: "asc" }],
    include: {
      vinculos: {
        include: {
          tenant: { select: { id: true, nome: true } },
          empresa: { select: { nomeFantasia: true, razaoSocial: true } },
          perfil: { select: { nome: true } }
        }
      }
    }
  });

  return usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    email: u.email,
    status: u.status,
    plataformaAdmin: u.plataformaAdmin,
    ultimoAcessoEm: u.ultimoAcessoEm?.toISOString() ?? null,
    criadoEm: u.criadoEm.toISOString(),
    vinculos: u.vinculos.map((v) => ({
      clienteId: v.tenant.id,
      clienteNome: v.tenant.nome,
      empresaNome: v.empresa?.nomeFantasia || v.empresa?.razaoSocial || null,
      perfilNome: v.perfil.nome,
      ativo: v.ativo
    }))
  }));
}

/** Estrutura (empresas + perfis) de cada cliente, para montar o formulário de novo usuário. */
export type EstruturaCliente = {
  id: string;
  nome: string;
  empresas: { id: string; nome: string }[];
  perfis: { id: string; nome: string }[];
};

export async function listEstruturaClientes(): Promise<EstruturaCliente[]> {
  await requirePlatformAdmin();
  assertDb();

  const tenants = await prisma.tenant.findMany({
    orderBy: { nome: "asc" },
    include: {
      empresas: { select: { id: true, razaoSocial: true, nomeFantasia: true }, orderBy: [{ matriz: "desc" }, { razaoSocial: "asc" }] },
      perfis: { select: { id: true, nome: true }, orderBy: { nome: "asc" } }
    }
  });

  return tenants.map((t) => ({
    id: t.id,
    nome: t.nome,
    empresas: t.empresas.map((e) => ({ id: e.id, nome: e.nomeFantasia || e.razaoSocial })),
    perfis: t.perfis.map((p) => ({ id: p.id, nome: p.nome }))
  }));
}

export type CriarUsuarioInput = {
  nome: string;
  email: string;
  senha?: string;
  tipo: "CLIENTE" | "PLATAFORMA";
  tenantId?: string;
  empresaId?: string;
  perfilId?: string;
  whatsapp?: string;
};

export type CriarUsuarioResult = {
  usuarioId: string;
  email: string;
  senha: string;
  plataformaAdmin: boolean;
};

export async function criarUsuario(input: CriarUsuarioInput): Promise<CriarUsuarioResult> {
  const admin = await requirePlatformAdmin();
  assertDb();

  const nome = input.nome?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!nome || !email) throw new PlatformAdminError("Informe nome e e-mail.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new PlatformAdminError("E-mail inválido.");

  const jaExiste = await prisma.usuario.findUnique({ where: { email } });
  if (jaExiste) throw new PlatformAdminError(`Já existe um usuário com o e-mail ${email}.`);

  const senha = input.senha?.trim() || gerarSenhaTemporaria();
  if (senha.length < 8) throw new PlatformAdminError("A senha deve ter ao menos 8 caracteres.");

  const whatsapp = (input.whatsapp ?? "").replace(/\D+/g, "") || null;
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) {
    throw new PlatformAdminError("WhatsApp inválido — informe DDD + número (10 a 13 dígitos).");
  }

  // Dono da plataforma: conta separada, sem vínculo a cliente.
  if (input.tipo === "PLATAFORMA") {
    const usuario = await prisma.usuario.create({
      data: { nome, email, senhaHash: hashPassword(senha), status: "ATIVO", plataformaAdmin: true, whatsapp }
    });
    return { usuarioId: usuario.id, email, senha, plataformaAdmin: true };
  }

  // Usuário de cliente: exige tenant + empresa + perfil coerentes.
  const { tenantId, empresaId, perfilId } = input;
  if (!tenantId || !empresaId || !perfilId) {
    throw new PlatformAdminError("Para usuário de cliente, selecione cliente, empresa e perfil.");
  }
  const [empresa, perfil] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { tenantId: true } }),
    prisma.perfil.findUnique({ where: { id: perfilId }, select: { tenantId: true } })
  ]);
  if (!empresa || empresa.tenantId !== tenantId) throw new PlatformAdminError("Empresa não pertence ao cliente selecionado.");
  if (!perfil || perfil.tenantId !== tenantId) throw new PlatformAdminError("Perfil não pertence ao cliente selecionado.");

  const usuario = await prisma.$transaction(async (tx) => {
    const u = await tx.usuario.create({
      data: { nome, email, senhaHash: hashPassword(senha), status: "ATIVO", plataformaAdmin: false, whatsapp }
    });
    await tx.usuarioVinculo.create({
      data: { tenantId, empresaId, usuarioId: u.id, perfilId, ativo: true }
    });
    await tx.auditoria.create({
      data: {
        tenantId,
        empresaId,
        usuarioId: admin.usuarioId,
        entidade: "Usuario",
        entidadeId: u.id,
        acao: "plataforma.criar_usuario",
        payload: { email, perfilId }
      }
    });
    return u;
  });

  return { usuarioId: usuario.id, email, senha, plataformaAdmin: false };
}

export type AtualizarUsuarioInput = {
  nome?: string;
  email?: string;
  status?: "ATIVO" | "INATIVO";
  plataformaAdmin?: boolean;
  /** WhatsApp para 2FA (só dígitos com DDD; string vazia limpa). */
  whatsapp?: string;
};

export async function atualizarUsuario(usuarioId: string, input: AtualizarUsuarioInput) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new PlatformAdminError("Usuário não encontrado.");

  const data: { nome?: string; email?: string; status?: "ATIVO" | "INATIVO"; plataformaAdmin?: boolean; whatsapp?: string | null } = {};

  if (input.whatsapp !== undefined) {
    const digs = input.whatsapp.replace(/\D+/g, "");
    if (digs && (digs.length < 10 || digs.length > 13)) {
      throw new PlatformAdminError("WhatsApp inválido — informe DDD + número (10 a 13 dígitos).");
    }
    data.whatsapp = digs || null;
  }

  if (input.nome !== undefined) {
    const nome = input.nome.trim();
    if (!nome) throw new PlatformAdminError("O nome não pode ficar vazio.");
    data.nome = nome;
  }
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new PlatformAdminError("E-mail inválido.");
    if (email !== usuario.email) {
      const dono = await prisma.usuario.findUnique({ where: { email } });
      if (dono && dono.id !== usuarioId) throw new PlatformAdminError(`Já existe um usuário com o e-mail ${email}.`);
      data.email = email;
    }
  }
  if (input.status !== undefined) {
    if (input.status === "INATIVO" && usuarioId === admin.usuarioId) {
      throw new PlatformAdminError("Você não pode inativar a própria conta.");
    }
    data.status = input.status;
  }
  if (input.plataformaAdmin !== undefined) {
    if (input.plataformaAdmin === false && usuarioId === admin.usuarioId) {
      throw new PlatformAdminError("Você não pode remover o próprio acesso de dono da plataforma.");
    }
    data.plataformaAdmin = input.plataformaAdmin;
  }

  const atualizado = await prisma.usuario.update({ where: { id: usuarioId }, data });

  // Inativar ou trocar e-mail encerra as sessões ativas do usuário.
  if (data.status === "INATIVO" || data.email) {
    await prisma.sessao.deleteMany({ where: { usuarioId } }).catch(() => undefined);
  }

  // Auditoria no tenant do primeiro vínculo (quando houver).
  const vinculo = await prisma.usuarioVinculo.findFirst({ where: { usuarioId }, orderBy: { criadoEm: "asc" } });
  if (vinculo) {
    await audit({
      tenantId: vinculo.tenantId,
      empresaId: vinculo.empresaId,
      usuarioId: admin.usuarioId,
      entidade: "Usuario",
      entidadeId: usuarioId,
      acao: "plataforma.atualizar_usuario",
      payload: { ...data }
    });
  }

  return {
    id: atualizado.id,
    nome: atualizado.nome,
    email: atualizado.email,
    status: atualizado.status,
    plataformaAdmin: atualizado.plataformaAdmin
  };
}

// ---------------------------------------------------------------------------
// Detalhe do usuário + gestão de vínculos (cliente / empresa / perfil)
// ---------------------------------------------------------------------------

export type UsuarioVinculoRow = {
  id: string;
  clienteId: string;
  clienteNome: string;
  empresaId: string | null;
  empresaNome: string | null;
  perfilId: string;
  perfilNome: string;
  ativo: boolean;
};

export type UsuarioDetail = {
  id: string;
  nome: string;
  email: string;
  status: "ATIVO" | "INATIVO";
  plataformaAdmin: boolean;
  whatsapp: string | null;
  ultimoAcessoEm: string | null;
  criadoEm: string;
  vinculos: UsuarioVinculoRow[];
};

export async function getUsuarioDetail(usuarioId: string): Promise<UsuarioDetail | null> {
  await requirePlatformAdmin();
  assertDb();

  const u = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: {
      vinculos: {
        orderBy: { criadoEm: "asc" },
        include: {
          tenant: { select: { id: true, nome: true } },
          empresa: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
          perfil: { select: { id: true, nome: true } }
        }
      }
    }
  });
  if (!u) return null;

  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    status: u.status,
    plataformaAdmin: u.plataformaAdmin,
    whatsapp: u.whatsapp ?? null,
    ultimoAcessoEm: u.ultimoAcessoEm?.toISOString() ?? null,
    criadoEm: u.criadoEm.toISOString(),
    vinculos: u.vinculos.map((v) => ({
      id: v.id,
      clienteId: v.tenant.id,
      clienteNome: v.tenant.nome,
      empresaId: v.empresa?.id ?? null,
      empresaNome: v.empresa?.nomeFantasia || v.empresa?.razaoSocial || null,
      perfilId: v.perfil.id,
      perfilNome: v.perfil.nome,
      ativo: v.ativo
    }))
  };
}

/** Encerra todas as sessões do usuário (após mudança de acesso/senha/vínculo). */
async function encerrarSessoes(usuarioId: string) {
  await prisma.sessao.deleteMany({ where: { usuarioId } }).catch(() => undefined);
}

export async function adicionarVinculo(
  usuarioId: string,
  input: { tenantId: string; empresaId: string; perfilId: string }
) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new PlatformAdminError("Usuário não encontrado.");

  const { tenantId, empresaId, perfilId } = input;
  if (!tenantId || !empresaId || !perfilId) {
    throw new PlatformAdminError("Selecione cliente, empresa e perfil.");
  }

  const [empresa, perfil] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { tenantId: true } }),
    prisma.perfil.findUnique({ where: { id: perfilId }, select: { tenantId: true } })
  ]);
  if (!empresa || empresa.tenantId !== tenantId) throw new PlatformAdminError("Empresa não pertence ao cliente selecionado.");
  if (!perfil || perfil.tenantId !== tenantId) throw new PlatformAdminError("Perfil não pertence ao cliente selecionado.");

  const jaExiste = await prisma.usuarioVinculo.findFirst({ where: { tenantId, empresaId, usuarioId, perfilId } });
  if (jaExiste) throw new PlatformAdminError("Esse vínculo (cliente/empresa/perfil) já existe para o usuário.");

  const vinculo = await prisma.usuarioVinculo.create({
    data: { tenantId, empresaId, usuarioId, perfilId, ativo: true }
  });
  await encerrarSessoes(usuarioId);
  await audit({
    tenantId,
    empresaId,
    usuarioId: admin.usuarioId,
    entidade: "UsuarioVinculo",
    entidadeId: vinculo.id,
    acao: "plataforma.adicionar_vinculo",
    payload: { usuarioId, perfilId }
  });

  return { id: vinculo.id };
}

export async function alterarPerfilVinculo(vinculoId: string, perfilId: string) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const vinculo = await prisma.usuarioVinculo.findUnique({ where: { id: vinculoId } });
  if (!vinculo) throw new PlatformAdminError("Vínculo não encontrado.");

  const perfil = await prisma.perfil.findUnique({ where: { id: perfilId }, select: { tenantId: true } });
  if (!perfil || perfil.tenantId !== vinculo.tenantId) {
    throw new PlatformAdminError("Perfil não pertence ao cliente do vínculo.");
  }

  const conflito = await prisma.usuarioVinculo.findFirst({
    where: {
      tenantId: vinculo.tenantId,
      empresaId: vinculo.empresaId,
      usuarioId: vinculo.usuarioId,
      perfilId,
      id: { not: vinculoId }
    }
  });
  if (conflito) throw new PlatformAdminError("O usuário já possui esse perfil nesta empresa.");

  await prisma.usuarioVinculo.update({ where: { id: vinculoId }, data: { perfilId } });
  await encerrarSessoes(vinculo.usuarioId);
  await audit({
    tenantId: vinculo.tenantId,
    empresaId: vinculo.empresaId,
    usuarioId: admin.usuarioId,
    entidade: "UsuarioVinculo",
    entidadeId: vinculoId,
    acao: "plataforma.alterar_perfil_vinculo",
    payload: { usuarioId: vinculo.usuarioId, perfilId }
  });

  return { id: vinculoId, perfilId };
}

export async function definirVinculoAtivo(vinculoId: string, ativo: boolean) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const vinculo = await prisma.usuarioVinculo.findUnique({ where: { id: vinculoId } });
  if (!vinculo) throw new PlatformAdminError("Vínculo não encontrado.");

  await prisma.usuarioVinculo.update({ where: { id: vinculoId }, data: { ativo } });
  if (!ativo) await encerrarSessoes(vinculo.usuarioId);
  await audit({
    tenantId: vinculo.tenantId,
    empresaId: vinculo.empresaId,
    usuarioId: admin.usuarioId,
    entidade: "UsuarioVinculo",
    entidadeId: vinculoId,
    acao: ativo ? "plataforma.ativar_vinculo" : "plataforma.desativar_vinculo",
    payload: { usuarioId: vinculo.usuarioId }
  });

  return { id: vinculoId, ativo };
}

export async function removerVinculo(vinculoId: string) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const vinculo = await prisma.usuarioVinculo.findUnique({ where: { id: vinculoId } });
  if (!vinculo) throw new PlatformAdminError("Vínculo não encontrado.");

  await prisma.usuarioVinculo.delete({ where: { id: vinculoId } });
  await encerrarSessoes(vinculo.usuarioId);
  await audit({
    tenantId: vinculo.tenantId,
    empresaId: vinculo.empresaId,
    usuarioId: admin.usuarioId,
    entidade: "UsuarioVinculo",
    entidadeId: vinculoId,
    acao: "plataforma.remover_vinculo",
    payload: { usuarioId: vinculo.usuarioId }
  });

  return { id: vinculoId };
}

// ---------------------------------------------------------------------------
// Perfis e permissões (RBAC por módulo) de um cliente
// ---------------------------------------------------------------------------

export type PerfilClienteRow = {
  id: string;
  nome: string;
  descricao: string | null;
  isAdmin: boolean;
  modulos: string[];
};

export async function listPerfisCliente(tenantId: string): Promise<PerfilClienteRow[]> {
  await requirePlatformAdmin();
  assertDb();

  const perfis = await prisma.perfil.findMany({
    where: { tenantId },
    orderBy: { nome: "asc" },
    include: { permissoes: { where: { acao: "acessar" }, select: { modulo: true } } }
  });

  return perfis.map((p) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    isAdmin: isAdminPerfil(p.nome),
    modulos: p.permissoes.map((perm) => perm.modulo)
  }));
}

export async function criarPerfilCliente(
  tenantId: string,
  input: { nome: string; descricao?: string; modulos: string[] }
) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) throw new PlatformAdminError("Cliente não encontrado.");

  const nome = input.nome?.trim();
  if (!nome) throw new PlatformAdminError("Informe o nome do perfil.");

  const jaExiste = await prisma.perfil.findUnique({ where: { tenantId_nome: { tenantId, nome } } });
  if (jaExiste) throw new PlatformAdminError(`Já existe um perfil "${nome}" neste cliente.`);

  const modulos = (input.modulos ?? []).filter((m) => (TODOS_MODULOS as string[]).includes(m));

  const perfil = await prisma.$transaction(async (tx) => {
    const p = await tx.perfil.create({
      data: {
        tenantId,
        nome,
        descricao: input.descricao?.trim() || null,
        permissoes: { create: modulos.map((modulo) => ({ tenantId, modulo, acao: "acessar" })) }
      }
    });
    await tx.auditoria.create({
      data: {
        tenantId,
        usuarioId: admin.usuarioId,
        entidade: "Perfil",
        entidadeId: p.id,
        acao: "plataforma.criar_perfil",
        payload: { nome, modulos }
      }
    });
    return p;
  });

  return { id: perfil.id };
}

export async function atualizarPerfilModulos(perfilId: string, modulos: string[]) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const perfil = await prisma.perfil.findUnique({ where: { id: perfilId } });
  if (!perfil) throw new PlatformAdminError("Perfil não encontrado.");

  const validos = (modulos ?? []).filter((m) => (TODOS_MODULOS as string[]).includes(m));

  await prisma.$transaction(async (tx) => {
    await tx.permissao.deleteMany({ where: { perfilId, acao: "acessar" } });
    if (validos.length > 0) {
      await tx.permissao.createMany({
        data: validos.map((modulo) => ({ tenantId: perfil.tenantId, perfilId, modulo, acao: "acessar" }))
      });
    }
    await tx.auditoria.create({
      data: {
        tenantId: perfil.tenantId,
        usuarioId: admin.usuarioId,
        entidade: "Perfil",
        entidadeId: perfilId,
        acao: "plataforma.atualizar_permissoes",
        payload: { modulos: validos }
      }
    });
  });

  return { id: perfilId, modulos: validos };
}

/* ===== Provedor de emissão fiscal no nível da plataforma (dono do SaaS) ===== */

export type ProvedorFiscalAmbiente = {
  ambiente: AmbienteFiscal;
  baseUrl: string;
  clientIdFinal: string | null;
  secretFinal: string | null;
  tokenFinal: string | null;
  configurado: boolean;
  ativo: boolean;
};

export type ProvedorFiscalInfo = {
  key: string;
  label: string;
  cred: "oauth" | "token" | "certificado";
  ambientes: ProvedorFiscalAmbiente[];
};

export type ProvedorFiscalPlataforma = {
  provedorAtivo: string;
  provedores: ProvedorFiscalInfo[];
};

/** Lê o provedor ativo + a config de todos os provedores por ambiente (segredos MASCARADOS). */
export async function getProvedorFiscalPlataforma(): Promise<ProvedorFiscalPlataforma> {
  await requirePlatformAdmin();
  assertDb();
  const [rows, provedorAtivo] = await Promise.all([
    prisma.plataformaProvedorFiscal.findMany(),
    getProvedorFiscalAtivo()
  ]);
  const provedores = PROVEDORES_FISCAIS.map((p) => ({
    key: p.key,
    label: p.label,
    cred: p.cred,
    ambientes: (["HOMOLOGACAO", "PRODUCAO"] as AmbienteFiscal[]).map((amb) => {
      const r = rows.find((x) => x.provedor === p.key && x.ambiente === amb);
      return {
        ambiente: amb,
        baseUrl: r?.baseUrl ?? defaultBaseUrl(p.key, amb),
        clientIdFinal: r?.clientIdFinal ?? null,
        secretFinal: r?.secretFinal ?? null,
        tokenFinal: r?.tokenFinal ?? null,
        // SEFAZ (certificado): autentica pelo certificado A1 da empresa, sem credencial de
        // plataforma — considera-se sempre "configurado" no nível do dono do SaaS.
        configurado:
          p.cred === "certificado"
            ? true
            : p.cred === "oauth"
              ? Boolean(r?.clientSecretCriptografado)
              : Boolean(r?.tokenCriptografado),
        ativo: r?.ativo ?? true
      };
    })
  }));
  return { provedorAtivo, provedores };
}

/** Define qual provedor de emissão está ativo na plataforma. */
export async function setProvedorFiscalAtivo(provedor: string): Promise<ProvedorFiscalPlataforma> {
  await requirePlatformAdmin();
  assertDb();
  if (!PROVEDORES_FISCAIS.some((p) => p.key === provedor)) throw new PlatformAdminError("Provedor inválido.");
  await prisma.plataformaConfiguracao.upsert({
    where: { id: "default" },
    update: { provedorFiscalAtivo: provedor },
    create: { id: "default", provedorFiscalAtivo: provedor }
  });
  return getProvedorFiscalPlataforma();
}

/** Salva credenciais/URL de um provedor+ambiente (segredos só atualizados quando informados). */
export async function saveProvedorFiscalPlataforma(input: {
  provedor: string;
  ambiente: AmbienteFiscal;
  clientId?: string;
  clientSecret?: string;
  token?: string;
  baseUrl?: string;
  ativo?: boolean;
}): Promise<ProvedorFiscalPlataforma> {
  await requirePlatformAdmin();
  assertDb();
  const provedor = input.provedor;
  if (!PROVEDORES_FISCAIS.some((p) => p.key === provedor)) {
    throw new PlatformAdminError("Provedor inválido.");
  }
  const ambiente = input.ambiente;
  if (ambiente !== "HOMOLOGACAO" && ambiente !== "PRODUCAO") {
    throw new PlatformAdminError("Ambiente inválido.");
  }

  const existing = await prisma.plataformaProvedorFiscal.findUnique({
    where: { provedor_ambiente: { provedor, ambiente } }
  });

  const data: {
    baseUrl: string | null;
    ativo: boolean;
    clientIdCriptografado?: string;
    clientIdFinal?: string;
    clientSecretCriptografado?: string;
    secretFinal?: string;
    tokenCriptografado?: string;
    tokenFinal?: string;
  } = {
    baseUrl: input.baseUrl?.trim() || null,
    ativo: input.ativo ?? existing?.ativo ?? true
  };
  const clientId = input.clientId?.trim();
  if (clientId) {
    data.clientIdCriptografado = encryptSecret(clientId);
    data.clientIdFinal = secretLastChars(clientId);
  }
  const clientSecret = input.clientSecret?.trim();
  if (clientSecret) {
    data.clientSecretCriptografado = encryptSecret(clientSecret);
    data.secretFinal = secretLastChars(clientSecret);
  }
  const token = input.token?.trim();
  if (token) {
    data.tokenCriptografado = encryptSecret(token);
    data.tokenFinal = secretLastChars(token);
  }

  await prisma.plataformaProvedorFiscal.upsert({
    where: { provedor_ambiente: { provedor, ambiente } },
    update: data,
    create: { provedor, ambiente, ...data }
  });

  return getProvedorFiscalPlataforma();
}

/** Testa as credenciais de um provedor+ambiente (ping autenticado), sem emitir nada. */
export async function testarCredenciaisProvedorPlataforma(
  provedor: string,
  ambiente: AmbienteFiscal
): Promise<{ ok: boolean; message: string }> {
  await requirePlatformAdmin();
  assertDb();
  if (!PROVEDORES_FISCAIS.some((p) => p.key === provedor)) throw new PlatformAdminError("Provedor inválido.");
  if (ambiente !== "HOMOLOGACAO" && ambiente !== "PRODUCAO") throw new PlatformAdminError("Ambiente inválido.");

  const provider = resolveFiscalProvider(provedor as ProvedorFiscal);
  if (!provider.testConnection) {
    return { ok: false, message: "Teste de conexão não disponível para este provedor." };
  }

  // SEFAZ (NF-e direto): autentica pelo certificado A1 da EMPRESA, não por credencial de
  // plataforma. O teste de conexão real (NFeStatusServico4) só pode ser feito no contexto da
  // empresa (em /erp, "Testar conexão"), pois depende do certificado dela — aqui no painel do
  // dono do SaaS não há o que validar.
  if (provedorCred(provedor) === "certificado") {
    return {
      ok: true,
      message:
        "Provedor SEFAZ ativo. A autenticação é feita pelo certificado A1 de cada empresa — teste a conexão na configuração fiscal da empresa."
    };
  }

  const cred = await getCredenciaisProvedorPlataforma(provedor, ambiente);
  const oauth = provedorCred(provedor) === "oauth";
  const token = oauth ? cred.clientSecret : cred.token;
  const cscId = oauth ? cred.clientId : null;
  if (!token) {
    return { ok: false, message: "Configure as credenciais deste ambiente antes de testar." };
  }

  try {
    return await provider.testConnection({
      ambiente,
      provedor: provedor as ProvedorFiscal,
      baseUrl: cred.baseUrl,
      token,
      cscId,
      cscToken: null,
      emissionMode: "COMPLETO"
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Falha ao testar a conexão." };
  }
}
