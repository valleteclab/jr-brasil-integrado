/**
 * Varredura de itens de entrada vinculados ao produto errado, por período.
 *
 * A correção em si reaproveita `updateFiscalEntryItemLinks`, que já sabe criar o produto,
 * recalcular CFOP/estoque e reavaliar o crédito de cada imposto conforme a finalidade. Aqui
 * só se acha o que está errado e se monta o lote.
 */

import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente, type TenantScope } from "@/lib/auth/dev-session";
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
      // O item não guarda ambiente — quem guarda é a nota. O isolamento entre homologação e
      // produção tem de vir pela relação, senão um ambiente enxerga o outro.
      ...scopedByTenantCompany(scope),
      produtoId: { not: null },
      entradaFiscal: { ...scopedByTenantCompanyAmbiente(scope), emitidaEm: { gte: inicio, lte: fim } }
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

  // Órfãos: item de nota já processada que movimenta estoque mas não aponta para produto
  // nenhum. É um estado inválido — o SPED sai sem o código do item (registro 0200) — e é o que
  // sobra quando um "criar SKU" é pedido depois do processamento, que nunca mais roda. Em
  // conferência é normal o item estar sem produto, por isso só conta nota já processada.
  const orfaos = await prisma.entradaFiscalItem.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      produtoId: null,
      movimentaEstoque: true,
      entradaFiscal: {
        ...scopedByTenantCompanyAmbiente(scope),
        emitidaEm: { gte: inicio, lte: fim },
        status: { notIn: ["AGUARDANDO_CONFERENCIA", "CONFERIDA"] }
      }
    },
    select: {
      id: true,
      itemNumero: true,
      descricaoFornecedor: true,
      codigoFornecedor: true,
      ncm: true,
      valorTotal: true,
      finalidade: true,
      cfopEntradaDerivado: true,
      entradaFiscal: { select: { numero: true } }
    },
    orderBy: [{ entradaFiscalId: "asc" }, { itemNumero: "asc" }]
  });
  const viewOrfaos: ItemDivergenteView[] = orfaos.map((o) => ({
    itemId: o.id,
    notaNumero: o.entradaFiscal?.numero ?? null,
    itemNumero: o.itemNumero,
    descricaoFornecedor: o.descricaoFornecedor ?? "",
    codigoFornecedor: o.codigoFornecedor,
    ncmNota: o.ncm,
    valorTotal: Number(o.valorTotal),
    produtoId: null,
    produtoNome: null,
    produtoSku: null,
    ncmProduto: null,
    finalidade: o.finalidade,
    cfopDerivado: o.cfopEntradaDerivado,
    pontuacao: 100,
    motivos: ["sem produto: o item movimenta estoque mas não aponta para nenhum produto, e o SPED sai sem o código dele"],
    nomeSugerido: nomeSugerido(o.descricaoFornecedor ?? ""),
    precisaRevisar: true
  }));

  const porId = new Map(itens.map((i) => [i.id, i]));
  const divergentes = detectarVinculosDivergentes(paraAnalise).flatMap((d) => {
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
  return [...viewOrfaos, ...divergentes];
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
      ...scopedByTenantCompany(scope),
      entradaFiscal: { ...scopedByTenantCompanyAmbiente(scope), emitidaEm: { gte: inicio, lte: fim } }
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

/**
 * Itens do mês com uma dada finalidade — para aplicar a troca em lote.
 *
 * Devolve o produto vinculado junto com o item porque trocar a finalidade exige reafirmar o
 * vínculo: o gravador entende "sem produto" como pedido de desvincular, e o item perderia o
 * código no SPED.
 */
export async function itensComFinalidade(
  scope: TenantScope,
  params: { ano: number; mes: number; finalidade: string }
): Promise<Array<{ itemId: string; produtoId: string | null }>> {
  const { inicio, fim } = faixaDoMes(params.ano, params.mes);
  const itens = await prisma.entradaFiscalItem.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      finalidade: params.finalidade as never,
      entradaFiscal: { ...scopedByTenantCompanyAmbiente(scope), emitidaEm: { gte: inicio, lte: fim } }
    },
    select: { id: true, produtoId: true }
  });
  return itens.map((i) => ({ itemId: i.id, produtoId: i.produtoId }));
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
    where: {
      ...scopedByTenantCompany(scope),
      produtoId: { in: produtoIds },
      ncm: { not: null },
      entradaFiscal: scopedByTenantCompanyAmbiente(scope)
    },
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
    where: { ...scopedByTenantCompany(scope), id: { in: produtoIds } },
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

/**
 * Produtos que perdem itens numa correção — os que precisam ter o NCM reposto depois.
 *
 * Vem de dois lugares: o produto ao qual o item aponta agora, e o produto da memória
 * fornecedor+código. O segundo cobre o item que já está sem produto (vínculo desfeito antes):
 * a memória ainda guarda para onde ele apontava. Tem de ser lido ANTES da correção, que
 * reaponta essa memória para o produto novo.
 */
export async function produtosAfetadosPelaCorrecao(scope: TenantScope, itemIds: string[]): Promise<string[]> {
  if (!itemIds.length) return [];
  const itens = await prisma.entradaFiscalItem.findMany({
    where: { ...scopedByTenantCompany(scope), id: { in: itemIds } },
    select: { produtoId: true, codigoFornecedor: true, entradaFiscal: { select: { fornecedorId: true } } }
  });

  const afetados = new Set<string>();
  const pares: Array<{ fornecedorId: string; codigoFornecedor: string }> = [];
  for (const item of itens) {
    if (item.produtoId) afetados.add(item.produtoId);
    if (item.entradaFiscal.fornecedorId) {
      pares.push({ fornecedorId: item.entradaFiscal.fornecedorId, codigoFornecedor: item.codigoFornecedor });
    }
  }
  if (pares.length) {
    const memorias = await prisma.produtoFornecedor.findMany({
      where: { ...scopedByTenantCompany(scope), OR: pares },
      select: { produtoId: true }
    });
    for (const m of memorias) afetados.add(m.produtoId);
  }
  return Array.from(afetados);
}
