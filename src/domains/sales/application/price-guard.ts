import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { validarSenhaAdmin } from "@/lib/auth/admin-credential";

/**
 * Origem do preço unitário aplicado pelo vendedor na linha da venda:
 *  - VISTA:  preço de tabela à vista (Produto.precoVenda) — padrão.
 *  - PRAZO:  preço de tabela a prazo (Produto.precoVendaPrazo), ex.: venda no boleto/crediário.
 *  - MANUAL: digitado na venda (negociação daquele atendimento).
 */
export type TipoPrecoVenda = "VISTA" | "PRAZO" | "MANUAL";

export function normalizarTipoPreco(value: unknown): TipoPrecoVenda | null {
  return value === "VISTA" || value === "PRAZO" || value === "MANUAL" ? (value as TipoPrecoVenda) : null;
}

export type ItemPrecificado = {
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
  /** Desconto explícito da linha em R$. */
  desconto?: number | null;
  tipoPreco?: TipoPrecoVenda | null;
};

export type AutorizacaoPrecoResultado = {
  /** Admin que autorizou (senha validada) — null quando a venda não exigiu autorização. */
  autorizadoPor: { usuarioId: string; nome: string } | null;
  descontoItens: number;
  /** Preço manual abaixo do preço de tabela escolhido, convertido em desconto (R$). */
  descontoImplicitoPreco: number;
  descontoGlobal: number;
  descontoTotal: number;
  descontoPctEfetivo: number;
  /** Limite (%) da empresa sem autorização (Empresa.descontoSemAutorizacaoPct). */
  limitePct: number;
  /** SKUs vendidos abaixo do preço mínimo do cadastro (sempre exigem autorização). */
  itensAbaixoMinimo: string[];
};

/**
 * Autorização de PREÇO e DESCONTO da venda — validada NO SERVIDOR (a UI pré-valida só por UX).
 *
 * O preço de referência de cada linha é a tabela escolhida pelo vendedor (à vista ou a prazo).
 * Vender ABAIXO dessa referência é desconto — explícito (campo desconto) ou implícito (preço
 * manual menor) — e a soma dos dois entra na régua `Empresa.descontoSemAutorizacaoPct`: acima
 * do limite, exige senha de admin. Vender abaixo do PREÇO MÍNIMO do produto sempre exige senha,
 * independentemente do percentual. Vender ACIMA da referência é livre.
 *
 * Sem isso, editar o preço na tela burlaria o controle de desconto (o servidor aceitaria
 * qualquer preço vindo do cliente).
 */
export async function autorizarPrecosVenda(
  scope: TenantScope,
  params: {
    itens: ItemPrecificado[];
    /** Desconto global da venda em R$. */
    descontoGlobal?: number | null;
    /** Outros valores brutos (ex.: serviços do PDV) somados ao subtotal do % efetivo. */
    outrosValores?: number;
    senhaAdmin?: string;
  }
): Promise<AutorizacaoPrecoResultado> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { descontoSemAutorizacaoPct: true }
  });
  const limite = Number(empresa?.descontoSemAutorizacaoPct ?? 0);

  const produtos = await prisma.produto.findMany({
    where: { id: { in: params.itens.map((i) => i.produtoId) }, ...scopedByTenantCompany(scope) },
    select: { id: true, sku: true, precoVenda: true, precoVendaPrazo: true, precoMinimo: true }
  });
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));

  let subtotalReferencia = Math.max(0, params.outrosValores ?? 0);
  const descontoItens = params.itens.reduce((s, i) => s + Math.max(0, i.desconto ?? 0), 0);
  const descontoGlobal = Math.max(0, params.descontoGlobal ?? 0);
  let descontoImplicitoPreco = 0;
  const itensAbaixoMinimo: string[] = [];

  for (const item of params.itens) {
    const produto = produtoPorId.get(item.produtoId);
    const precoVista = Number(produto?.precoVenda ?? 0);
    const precoPrazo = Number(produto?.precoVendaPrazo ?? 0);
    const precoMinimo = Number(produto?.precoMinimo ?? 0);
    // Referência = tabela escolhida. Produto sem preço de tabela (ex.: insumo criado sem preço)
    // usa o próprio preço enviado — não há desconto implícito a medir.
    const tabela = item.tipoPreco === "PRAZO" && precoPrazo > 0 ? precoPrazo : precoVista;
    const referencia = tabela > 0 ? tabela : item.precoUnitario;
    subtotalReferencia += referencia * item.quantidade;
    descontoImplicitoPreco += Math.max(0, referencia - item.precoUnitario) * item.quantidade;
    if (precoMinimo > 0 && item.precoUnitario < precoMinimo - 0.005) {
      itensAbaixoMinimo.push(produto?.sku ?? item.produtoId);
    }
  }

  const descontoTotal = descontoItens + descontoGlobal + descontoImplicitoPreco;
  const descontoPctEfetivo = subtotalReferencia > 0 ? (descontoTotal / subtotalReferencia) * 100 : 0;
  const resultado: AutorizacaoPrecoResultado = {
    autorizadoPor: null,
    descontoItens,
    descontoImplicitoPreco,
    descontoGlobal,
    descontoTotal,
    descontoPctEfetivo,
    limitePct: limite,
    itensAbaixoMinimo
  };

  const precisaAutorizacao = descontoPctEfetivo > limite + 0.01 || itensAbaixoMinimo.length > 0;
  if (!precisaAutorizacao) return resultado;

  if (!params.senhaAdmin?.trim()) {
    if (itensAbaixoMinimo.length) {
      throw new Error(
        `Preço abaixo do mínimo do produto (${itensAbaixoMinimo.join(", ")}). Exige senha de administrador.`
      );
    }
    throw new Error(
      `Desconto de ${descontoPctEfetivo.toFixed(2)}% acima do limite (${limite.toFixed(2)}%). Exige senha de administrador.`
    );
  }
  resultado.autorizadoPor = await validarSenhaAdmin(scope, params.senhaAdmin);
  return resultado;
}
