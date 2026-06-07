import { hashPassword } from "@/lib/security/password";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { formatBrl } from "@/lib/formatters/currency";
import { PERFIS_PADRAO, TODOS_MODULOS, isAdminPerfil, type ModuloKey } from "@/lib/auth/modules";

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
  lojaHabilitada: boolean;
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
    lojaHabilitada: tenant.lojaHabilitada,
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
      cidade: e.enderecoCidade,
      uf: e.enderecoUf
    })),
    usuarios: Array.from(usuariosMap.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  };
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

  // Dono da plataforma: conta separada, sem vínculo a cliente.
  if (input.tipo === "PLATAFORMA") {
    const usuario = await prisma.usuario.create({
      data: { nome, email, senhaHash: hashPassword(senha), status: "ATIVO", plataformaAdmin: true }
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
      data: { nome, email, senhaHash: hashPassword(senha), status: "ATIVO", plataformaAdmin: false }
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
};

export async function atualizarUsuario(usuarioId: string, input: AtualizarUsuarioInput) {
  const admin = await requirePlatformAdmin();
  assertDb();

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new PlatformAdminError("Usuário não encontrado.");

  const data: { nome?: string; email?: string; status?: "ATIVO" | "INATIVO"; plataformaAdmin?: boolean } = {};

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
