/**
 * Varredura de itens de entrada vinculados ao produto errado, por período.
 *
 * A correção em si reaproveita `updateFiscalEntryItemLinks`, que já sabe criar o produto,
 * recalcular CFOP/estoque e reavaliar o crédito de cada imposto conforme a finalidade. Aqui
 * só se acha o que está errado e se monta o lote.
 */

import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompanyAmbiente, type TenantScope } from "@/lib/auth/dev-session";
import {
  detectarVinculosDivergentes,
  nomeSugerido,
  LIMITE_REVISAO,
  type ItemParaAnalise
} from "./vinculo-divergente";

export type ItemDivergenteView = {
  itemId: string;
  notaNumero: string | null;
  itemNumero: number;
  descricaoFornecedor: string;
  codigoFornecedor: string | null;
  ncmNota: string | null;
  valorTotal: number;
  produtoId: string | null;
  produtoNome: string | null;
  produtoSku: string | null;
  ncmProduto: string | null;
  finalidade: string | null;
  cfopDerivado: string | null;
  pontuacao: number;
  motivos: string[];
  /** Nome que o produto novo receberia, já normalizado. */
  nomeSugerido: string;
  precisaRevisar: boolean;
};

/** Primeiro e último instante do mês, no fuso local. */
function faixaDoMes(ano: number, mes: number): { inicio: Date; fim: Date } {
  return { inicio: new Date(ano, mes - 1, 1, 0, 0, 0, 0), fim: new Date(ano, mes, 0, 23, 59, 59, 999) };
}

/**
 * Lista os itens de entrada do mês cujo vínculo com o produto parece errado.
 *
 * Varre o período inteiro (e não nota a nota) porque o erro clássico é a mesma pessoa repetir
 * o engano em várias notas seguidas.
 */
export async function listarVinculosDivergentes(
  scope: TenantScope,
  params: { ano: number; mes: number }
): Promise<ItemDivergenteView[]> {
  const { inicio, fim } = faixaDoMes(params.ano, params.mes);

  const itens = await prisma.entradaFiscalItem.findMany({
    where: {
      ...scopedByTenantCompanyAmbiente(scope),
      produtoId: { not: null },
      entradaFiscal: { emitidaEm: { gte: inicio, lte: fim } }
    },
    select: {
      id: true,
      itemNumero: true,
      descricaoFornecedor: true,
      codigoFornecedor: true,
      ncm: true,
      valorTotal: true,
      produtoId: true,
      finalidade: true,
      cfopEntradaDerivado: true,
      entradaFiscalId: true,
      entradaFiscal: { select: { numero: true } },
      produto: { select: { nome: true, sku: true, ncm: true } }
    },
    orderBy: [{ entradaFiscalId: "asc" }, { itemNumero: "asc" }]
  });

  const paraAnalise: ItemParaAnalise[] = itens.map((i) => ({
    id: i.id,
    notaId: i.entradaFiscalId,
    descricaoFornecedor: i.descricaoFornecedor ?? "",
    ncmNota: i.ncm,
    produtoId: i.produtoId,
    produtoNome: i.produto?.nome ?? null,
    ncmProduto: i.produto?.ncm ?? null
  }));

  const porId = new Map(itens.map((i) => [i.id, i]));
  return detectarVinculosDivergentes(paraAnalise).flatMap((d) => {
    const item = porId.get(d.itemId);
    if (!item) return [];
    return [
      {
        itemId: d.itemId,
        notaNumero: item.entradaFiscal?.numero ?? null,
        itemNumero: item.itemNumero,
        descricaoFornecedor: item.descricaoFornecedor ?? "",
        codigoFornecedor: item.codigoFornecedor,
        ncmNota: item.ncm,
        valorTotal: Number(item.valorTotal),
        produtoId: item.produtoId,
        produtoNome: item.produto?.nome ?? null,
        produtoSku: item.produto?.sku ?? null,
        ncmProduto: item.produto?.ncm ?? null,
        finalidade: item.finalidade,
        cfopDerivado: item.cfopEntradaDerivado,
        pontuacao: d.pontuacao,
        motivos: d.motivos,
        nomeSugerido: nomeSugerido(item.descricaoFornecedor ?? ""),
        precisaRevisar: d.pontuacao >= LIMITE_REVISAO
      }
    ];
  });
}

/**
 * Contagem de itens por finalidade/CFOP no mês — alimenta a correção de finalidade em lote.
 *
 * Mostra o CFOP DERIVADO (1126, 1128, 1556…), que é o que vai para o SPED e é por onde a
 * contabilidade identifica o lançamento, e não o CFOP do fornecedor que veio no XML.
 */
export async function resumoFinalidadesDoMes(
  scope: TenantScope,
  params: { ano: number; mes: number }
): Promise<Array<{ finalidade: string | null; cfopDerivado: string | null; itens: number; valor: number }>> {
  const { inicio, fim } = faixaDoMes(params.ano, params.mes);
  const linhas = await prisma.entradaFiscalItem.groupBy({
    by: ["finalidade", "cfopEntradaDerivado"],
    where: {
      ...scopedByTenantCompanyAmbiente(scope),
      entradaFiscal: { emitidaEm: { gte: inicio, lte: fim } }
    },
    _count: { _all: true },
    _sum: { valorTotal: true }
  });
  return linhas
    .map((l) => ({
      finalidade: l.finalidade,
      cfopDerivado: l.cfopEntradaDerivado,
      itens: l._count._all,
      valor: Number(l._sum.valorTotal ?? 0)
    }))
    .sort((a, b) => b.valor - a.valor);
}

/** IDs dos itens do mês com uma dada finalidade — para aplicar a troca em lote. */
export async function itensComFinalidade(
  scope: TenantScope,
  params: { ano: number; mes: number; finalidade: string }
): Promise<string[]> {
  const { inicio, fim } = faixaDoMes(params.ano, params.mes);
  const itens = await prisma.entradaFiscalItem.findMany({
    where: {
      ...scopedByTenantCompanyAmbiente(scope),
      finalidade: params.finalidade as never,
      entradaFiscal: { emitidaEm: { gte: inicio, lte: fim } }
    },
    select: { id: true }
  });
  return itens.map((i) => i.id);
}

/**
 * Recoloca no produto o NCM que os itens dele realmente têm.
 *
 * Quando um item é vinculado, o sistema grava no produto o NCM daquele item — é assim que o
 * cadastro aprende a classificação correta. O efeito colateral é que um vínculo errado
 * sobrescreve o NCM do produto: o "CIMENTO 50 KG" ficou com NCM de conector elétrico porque
 * foi o último item lançado nele.
 *
 * Depois de desfazer os vínculos errados, o NCM certo é o que aparece na MAIORIA dos itens que
 * continuam vinculados ao produto — a classificação que os fornecedores repetem. Produto sem
 * nenhum item vinculado fica como está: sem dado, melhor não chutar.
 */
export async function recalcularNcmDosProdutos(
  scope: TenantScope,
  produtoIds: string[]
): Promise<Array<{ produtoId: string; sku: string | null; de: string | null; para: string }>> {
  if (!produtoIds.length) return [];

  const itens = await prisma.entradaFiscalItem.findMany({
    where: { ...scopedByTenantCompanyAmbiente(scope), produtoId: { in: produtoIds }, ncm: { not: null } },
    select: { produtoId: true, ncm: true }
  });

  const frequencia = new Map<string, Map<string, number>>();
  for (const item of itens) {
    if (!item.produtoId || !item.ncm) continue;
    const ncm = item.ncm.replace(/\D/g, "");
    if (ncm.length < 8) continue;
    const doProduto = frequencia.get(item.produtoId) ?? new Map<string, number>();
    doProduto.set(ncm, (doProduto.get(ncm) ?? 0) + 1);
    frequencia.set(item.produtoId, doProduto);
  }

  const produtos = await prisma.produto.findMany({
    where: { ...scopedByTenantCompanyAmbiente(scope), id: { in: produtoIds } },
    select: { id: true, sku: true, ncm: true }
  });

  const mudancas: Array<{ produtoId: string; sku: string | null; de: string | null; para: string }> = [];
  for (const produto of produtos) {
    const contagem = frequencia.get(produto.id);
    if (!contagem?.size) continue;
    // Empate resolve pelo NCM menor, só para o resultado ser estável entre execuções.
    const [ncmVencedor] = Array.from(contagem.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0];
    if ((produto.ncm ?? "").replace(/\D/g, "") === ncmVencedor) continue;
    mudancas.push({ produtoId: produto.id, sku: produto.sku, de: produto.ncm, para: ncmVencedor });
  }

  for (const m of mudancas) {
    await prisma.produto.update({ where: { id: m.produtoId }, data: { ncm: m.para } });
  }
  return mudancas;
}
