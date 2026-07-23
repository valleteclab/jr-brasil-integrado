import { getDevelopmentTenantScope, scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { TipoNegocio } from "@/lib/auth/modules";
import { getTenantFeatures } from "@/lib/auth/tenant-features";
import { allFeaturesEnabled, type TenantFeatures } from "@/lib/auth/feature-flags";

export type ErpShellBadges = {
  vendas: number;
  orcamentos: number;
  os: number;
  compras: number;
  estoque: number;
  financeiro: number;
};

export type ErpShellContext = {
  empresaNome: string;
  usuarioNome: string;
  usuarioIniciais: string;
  usuarioPerfil: string;
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  tipoNegocio: TipoNegocio;
  /** Identidade visual da empresa (Configurações → Aparência). */
  logoSistema: string | null;
  corDestaque: string | null;
  /** Módulo SPED Fiscal liberado pelo dono do SaaS para este tenant (esconde o item do menu). */
  spedFiscalHabilitado: boolean;
  /** Módulo Expedição (recibo de retirada) liberado pelo dono do SaaS para este tenant. */
  expedicaoHabilitada: boolean;
  /** Flags de módulo liberadas pelo dono do SaaS (esconde itens do menu e bloqueia URLs). */
  features: TenantFeatures;
  /** Plano comercial do tenant (COMPLETO | EMISSOR | CHAT) — muda o menu e o foco da UI. */
  plano: "COMPLETO" | "EMISSOR" | "CHAT";
  /** Fim do trial (ISO) e se já venceu — o layout do ERP bloqueia quando vencido. */
  trialFimEm: string | null;
  trialVencido: boolean;
  /** Mensalidade em atraso (assinatura Asaas): aviso ≥3 dias, bloqueio ≥7 dias. */
  mensalidade: MensalidadeEstado;
  badges: ErpShellBadges;
};

export type MensalidadeEstado = {
  diasAtraso: number | null;
  faturaUrl: string | null;
  /** ≥ 3 e < 7 dias: aviso não bloqueante com link de pagamento. */
  aviso: boolean;
  /** ≥ 7 dias: bloqueia o ERP (tela de mensalidade em atraso). */
  bloqueado: boolean;
  /** Dias que ainda restam antes do bloqueio (quando em aviso). */
  diasAteBloqueio: number | null;
};

/** Tolerância antes de bloquear e a partir de quando avisar o cliente (dias de atraso). */
export const MENSALIDADE_TOLERANCIA_DIAS = 7;
export const MENSALIDADE_AVISO_DIAS = 3;

/** Deriva o estado da mensalidade em atraso a partir do vencimento da fatura vencida. */
export function derivarMensalidade(vencidaEm: Date | null, faturaUrl: string | null): MensalidadeEstado {
  if (!vencidaEm) return { diasAtraso: null, faturaUrl: null, aviso: false, bloqueado: false, diasAteBloqueio: null };
  const diasAtraso = Math.floor((Date.now() - vencidaEm.getTime()) / 86400000);
  const bloqueado = diasAtraso >= MENSALIDADE_TOLERANCIA_DIAS;
  const aviso = diasAtraso >= MENSALIDADE_AVISO_DIAS && !bloqueado;
  return {
    diasAtraso,
    faturaUrl: faturaUrl ?? null,
    aviso,
    bloqueado,
    diasAteBloqueio: bloqueado ? 0 : Math.max(0, MENSALIDADE_TOLERANCIA_DIAS - diasAtraso)
  };
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "JR";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

const SHELL_FALLBACK: ErpShellContext = {
  empresaNome: "XERP",
  usuarioNome: "Operador",
  usuarioIniciais: "OP",
  usuarioPerfil: "Sem vínculo",
  ambiente: "HOMOLOGACAO",
  tipoNegocio: "AMBOS",
  logoSistema: null,
  corDestaque: null,
  spedFiscalHabilitado: false,
  expedicaoHabilitada: false,
  // Fail-open: em fallback (banco indisponível) não escondemos módulos.
  features: allFeaturesEnabled(),
  plano: "COMPLETO",
  trialFimEm: null,
  trialVencido: false,
  mensalidade: { diasAtraso: null, faturaUrl: null, aviso: false, bloqueado: false, diasAteBloqueio: null },
  badges: { vendas: 0, orcamentos: 0, os: 0, compras: 0, estoque: 0, financeiro: 0 }
};

/**
 * Contexto do shell do ERP totalmente derivado do banco: empresa e usuário corrente,
 * ambiente fiscal configurado e contadores reais de cada módulo para os badges da
 * navegação. Em caso de banco indisponível, devolve um fallback neutro sem dados falsos.
 */
export async function getErpShellContext(): Promise<ErpShellContext> {
  try {
    const scope = await getDevelopmentTenantScope();
    const base = scopedByTenantCompany(scope);
    // Badges dos documentos com ambiente: isola homologação × produção. Compras e estoque
    // (PedidoCompra/EstoqueSaldo) não têm ambiente e seguem usando `base`.
    const baseAmb = scopedByTenantCompanyAmbiente(scope);
    const agora = new Date();

    const [
      empresa,
      session,
      features,
      tenantPlano,
      configFiscal,
      vendas,
      orcamentos,
      os,
      compras,
      saldos,
      pagarVencidas,
      receberVencidas
    ] = await Promise.all([
      prisma.empresa.findUnique({
        where: { id: scope.empresaId },
        select: { razaoSocial: true, nomeFantasia: true, tipoNegocio: true, logoSistema: true, corDestaque: true }
      }),
      // Usuário REALMENTE logado (sessão atual) — não o vínculo mais antigo da empresa.
      getSession(),
      // Todas as flags de módulo liberadas pelo dono do SaaS (gate de menu + URL).
      getTenantFeatures(scope.tenantId),
      // Plano comercial + trial (Emissor de Notas × Completo; trial vencido bloqueia o ERP).
      prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { plano: true, trialFimEm: true, mensalidadeVencidaEm: true, mensalidadeFaturaUrl: true } }),
      prisma.configuracaoFiscal.findUnique({
        where: { empresaId: scope.empresaId },
        select: { ambiente: true, ativo: true }
      }),
      prisma.pedidoVenda.count({
        where: { ...baseAmb, status: { in: ["RASCUNHO", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_NOTA", "SEPARACAO"] } }
      }),
      prisma.orcamento.count({
        where: { ...baseAmb, status: { in: ["EM_ANALISE", "AGUARDANDO_CLIENTE"] } }
      }),
      prisma.ordemServico.count({
        where: { ...baseAmb, status: { notIn: ["FATURADA", "CANCELADA"] } }
      }),
      prisma.pedidoCompra.count({
        where: { ...base, status: { in: ["RASCUNHO", "ENVIADO", "PARCIAL"] } }
      }),
      prisma.estoqueSaldo.findMany({
        where: { ...base },
        select: { produtoId: true, quantidade: true, minimo: true }
      }),
      prisma.contaPagar.count({
        where: { ...baseAmb, status: { in: ["ABERTO", "PARCIAL"] }, vencimento: { lt: agora } }
      }),
      prisma.contaReceber.count({
        where: { ...baseAmb, status: { in: ["ABERTO", "PARCIAL"] }, vencimento: { lt: agora } }
      })
    ]);

    const criticosPorProduto = new Map<string, { saldo: number; minimo: number }>();
    for (const s of saldos) {
      const atual = criticosPorProduto.get(s.produtoId) ?? { saldo: 0, minimo: 0 };
      atual.saldo += Number(s.quantidade);
      atual.minimo = Math.max(atual.minimo, Number(s.minimo));
      criticosPorProduto.set(s.produtoId, atual);
    }
    const estoqueCritico = Array.from(criticosPorProduto.values()).filter(
      (p) => p.minimo > 0 && p.saldo <= p.minimo
    ).length;

    const empresaNome = empresa?.nomeFantasia ?? empresa?.razaoSocial ?? SHELL_FALLBACK.empresaNome;
    const usuarioNome = session?.nome ?? SHELL_FALLBACK.usuarioNome;

    return {
      empresaNome,
      usuarioNome,
      usuarioIniciais: iniciais(usuarioNome),
      usuarioPerfil: session?.perfilNome ?? SHELL_FALLBACK.usuarioPerfil,
      // Selo do cabeçalho = ambiente fiscal REAL (o que carimba a nota e define validade na SEFAZ).
      // Não depende de `ativo` (a flag "Emissão ativa" liga/desliga o módulo, não muda o ambiente):
      // antes, ambiente=PRODUCAO com emissão inativa mostrava "Homologação" e enganava o usuário.
      ambiente: configFiscal?.ambiente === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO",
      tipoNegocio: empresa?.tipoNegocio ?? "AMBOS",
      logoSistema: empresa?.logoSistema ?? null,
      corDestaque: empresa?.corDestaque ?? null,
      spedFiscalHabilitado: features.spedFiscalHabilitado,
      expedicaoHabilitada: features.expedicaoHabilitada,
      features,
      plano: tenantPlano?.plano === "EMISSOR" ? "EMISSOR" : tenantPlano?.plano === "CHAT" ? "CHAT" : "COMPLETO",
      trialFimEm: tenantPlano?.trialFimEm?.toISOString() ?? null,
      trialVencido: Boolean(tenantPlano?.trialFimEm && tenantPlano.trialFimEm < new Date()),
      mensalidade: derivarMensalidade(tenantPlano?.mensalidadeVencidaEm ?? null, tenantPlano?.mensalidadeFaturaUrl ?? null),
      badges: {
        vendas,
        orcamentos,
        os,
        compras,
        estoque: estoqueCritico,
        financeiro: pagarVencidas + receberVencidas
      }
    };
  } catch {
    return SHELL_FALLBACK;
  }
}
