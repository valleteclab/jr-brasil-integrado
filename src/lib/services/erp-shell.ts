import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import type { TipoNegocio } from "@/lib/auth/modules";

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
  badges: ErpShellBadges;
};

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "JR";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

const SHELL_FALLBACK: ErpShellContext = {
  empresaNome: "JR Brasil - ERP",
  usuarioNome: "Operador",
  usuarioIniciais: "OP",
  usuarioPerfil: "Sem vínculo",
  ambiente: "HOMOLOGACAO",
  tipoNegocio: "AMBOS",
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
    const agora = new Date();

    const [
      empresa,
      vinculo,
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
        select: { razaoSocial: true, nomeFantasia: true, tipoNegocio: true }
      }),
      prisma.usuarioVinculo.findFirst({
        where: { ...base, ativo: true },
        orderBy: { criadoEm: "asc" },
        select: { usuario: { select: { nome: true } }, perfil: { select: { nome: true } } }
      }),
      prisma.configuracaoFiscal.findUnique({
        where: { empresaId: scope.empresaId },
        select: { ambiente: true, ativo: true }
      }),
      prisma.pedidoVenda.count({
        where: { ...base, status: { in: ["RASCUNHO", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_NOTA", "SEPARACAO"] } }
      }),
      prisma.orcamento.count({
        where: { ...base, status: { in: ["EM_ANALISE", "AGUARDANDO_CLIENTE"] } }
      }),
      prisma.ordemServico.count({
        where: { ...base, status: { notIn: ["FATURADA", "CANCELADA"] } }
      }),
      prisma.pedidoCompra.count({
        where: { ...base, status: { in: ["RASCUNHO", "ENVIADO", "PARCIAL"] } }
      }),
      prisma.estoqueSaldo.findMany({
        where: { ...base },
        select: { produtoId: true, quantidade: true, minimo: true }
      }),
      prisma.contaPagar.count({
        where: { ...base, status: { in: ["ABERTO", "PARCIAL"] }, vencimento: { lt: agora } }
      }),
      prisma.contaReceber.count({
        where: { ...base, status: { in: ["ABERTO", "PARCIAL"] }, vencimento: { lt: agora } }
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
    const usuarioNome = vinculo?.usuario.nome ?? SHELL_FALLBACK.usuarioNome;

    return {
      empresaNome,
      usuarioNome,
      usuarioIniciais: iniciais(usuarioNome),
      usuarioPerfil: vinculo?.perfil.nome ?? SHELL_FALLBACK.usuarioPerfil,
      ambiente: configFiscal?.ativo && configFiscal.ambiente === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO",
      tipoNegocio: empresa?.tipoNegocio ?? "AMBOS",
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
