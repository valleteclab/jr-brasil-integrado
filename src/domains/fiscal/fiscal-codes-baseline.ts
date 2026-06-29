import { prisma } from "@/lib/db/prisma";
import { NBS_LIST } from "./nbs-data";
import { LC116_LIST } from "./lc116";

/**
 * Códigos fiscais de referência (GLOBAIS): Origem, CST ICMS, CSOSN, CST PIS/COFINS, CST IPI e
 * CFOP. Populam a tabela `CodigoFiscal` (tipo + codigo + descricao), fonte das descrições e dos
 * seletores nas telas fiscais. As listas pequenas são oficiais e completas; o CFOP é baixado de
 * dataset público (com fallback curado) por ter ~570 códigos.
 */

export type TipoCodigoFiscal = "ORIGEM" | "CST_ICMS" | "CSOSN" | "CST_PIS" | "CST_COFINS" | "CST_IPI" | "CFOP" | "NBS" | "LC116";

type Par = { codigo: string; descricao: string };

export const ORIGEM: Par[] = [
  { codigo: "0", descricao: "Nacional, exceto as indicadas nos códigos 3 a 5" },
  { codigo: "1", descricao: "Estrangeira - Importação direta, exceto a indicada no código 6" },
  { codigo: "2", descricao: "Estrangeira - Adquirida no mercado interno, exceto a indicada no código 7" },
  { codigo: "3", descricao: "Nacional, mercadoria/bem com Conteúdo de Importação superior a 40% e até 70%" },
  { codigo: "4", descricao: "Nacional, produção conforme processos produtivos básicos (PPB)" },
  { codigo: "5", descricao: "Nacional, mercadoria/bem com Conteúdo de Importação de até 40%" },
  { codigo: "6", descricao: "Estrangeira - Importação direta, sem similar nacional (lista CAMEX/gás natural)" },
  { codigo: "7", descricao: "Estrangeira - Adquirida no mercado interno, sem similar nacional (lista CAMEX/gás natural)" },
  { codigo: "8", descricao: "Nacional, mercadoria/bem com Conteúdo de Importação superior a 70%" }
];

export const CST_ICMS: Par[] = [
  { codigo: "00", descricao: "Tributada integralmente" },
  { codigo: "10", descricao: "Tributada e com cobrança do ICMS por substituição tributária" },
  { codigo: "20", descricao: "Com redução de base de cálculo" },
  { codigo: "30", descricao: "Isenta/não tributada e com cobrança do ICMS por substituição tributária" },
  { codigo: "40", descricao: "Isenta" },
  { codigo: "41", descricao: "Não tributada" },
  { codigo: "50", descricao: "Suspensão" },
  { codigo: "51", descricao: "Diferimento" },
  { codigo: "60", descricao: "ICMS cobrado anteriormente por substituição tributária" },
  { codigo: "70", descricao: "Com redução de base de cálculo e cobrança do ICMS por ST" },
  { codigo: "90", descricao: "Outras" }
];

export const CSOSN: Par[] = [
  { codigo: "101", descricao: "Tributada pelo Simples Nacional com permissão de crédito" },
  { codigo: "102", descricao: "Tributada pelo Simples Nacional sem permissão de crédito" },
  { codigo: "103", descricao: "Isenção do ICMS no Simples Nacional para faixa de receita bruta" },
  { codigo: "201", descricao: "Tributada com permissão de crédito e com cobrança do ICMS por ST" },
  { codigo: "202", descricao: "Tributada sem permissão de crédito e com cobrança do ICMS por ST" },
  { codigo: "203", descricao: "Isenção do ICMS para faixa de receita bruta e com cobrança do ICMS por ST" },
  { codigo: "300", descricao: "Imune" },
  { codigo: "400", descricao: "Não tributada pelo Simples Nacional" },
  { codigo: "500", descricao: "ICMS cobrado anteriormente por ST ou por antecipação" },
  { codigo: "900", descricao: "Outros" }
];

// CST de PIS e COFINS compartilham a mesma tabela oficial.
const CST_PISCOFINS: Par[] = [
  { codigo: "01", descricao: "Operação Tributável com Alíquota Básica" },
  { codigo: "02", descricao: "Operação Tributável com Alíquota Diferenciada" },
  { codigo: "03", descricao: "Operação Tributável com Alíquota por Unidade de Medida de Produto" },
  { codigo: "04", descricao: "Operação Tributável Monofásica - Revenda a Alíquota Zero" },
  { codigo: "05", descricao: "Operação Tributável por Substituição Tributária" },
  { codigo: "06", descricao: "Operação Tributável a Alíquota Zero" },
  { codigo: "07", descricao: "Operação Isenta da Contribuição" },
  { codigo: "08", descricao: "Operação sem Incidência da Contribuição" },
  { codigo: "09", descricao: "Operação com Suspensão da Contribuição" },
  { codigo: "49", descricao: "Outras Operações de Saída" },
  { codigo: "50", descricao: "Operação com Direito a Crédito - Vinculada à Receita Tributada no Mercado Interno" },
  { codigo: "51", descricao: "Operação com Direito a Crédito - Vinculada à Receita Não Tributada no Mercado Interno" },
  { codigo: "52", descricao: "Operação com Direito a Crédito - Vinculada à Receita de Exportação" },
  { codigo: "53", descricao: "Operação com Direito a Crédito - Vinculada a Receitas Tributadas e Não-Tributadas no Mercado Interno" },
  { codigo: "54", descricao: "Operação com Direito a Crédito - Vinculada a Receitas Tributadas no Mercado Interno e de Exportação" },
  { codigo: "55", descricao: "Operação com Direito a Crédito - Vinculada a Receitas Não-Tributadas no Mercado Interno e de Exportação" },
  { codigo: "56", descricao: "Operação com Direito a Crédito - Vinculada a Receitas Tributadas e Não-Tributadas no Mercado Interno e de Exportação" },
  { codigo: "60", descricao: "Crédito Presumido - Operação de Aquisição Vinculada à Receita Tributada no Mercado Interno" },
  { codigo: "61", descricao: "Crédito Presumido - Operação de Aquisição Vinculada à Receita Não-Tributada no Mercado Interno" },
  { codigo: "62", descricao: "Crédito Presumido - Operação de Aquisição Vinculada à Receita de Exportação" },
  { codigo: "63", descricao: "Crédito Presumido - Operação de Aquisição Vinculada a Receitas Tributadas e Não-Tributadas no Mercado Interno" },
  { codigo: "64", descricao: "Crédito Presumido - Aquisição Vinculada a Receitas Tributadas no Mercado Interno e de Exportação" },
  { codigo: "65", descricao: "Crédito Presumido - Aquisição Vinculada a Receitas Não-Tributadas no Mercado Interno e de Exportação" },
  { codigo: "66", descricao: "Crédito Presumido - Aquisição Vinculada a Receitas Tributadas e Não-Tributadas no Mercado Interno e de Exportação" },
  { codigo: "67", descricao: "Crédito Presumido - Outras Operações" },
  { codigo: "70", descricao: "Operação de Aquisição sem Direito a Crédito" },
  { codigo: "71", descricao: "Operação de Aquisição com Isenção" },
  { codigo: "72", descricao: "Operação de Aquisição com Suspensão" },
  { codigo: "73", descricao: "Operação de Aquisição a Alíquota Zero" },
  { codigo: "74", descricao: "Operação de Aquisição sem Incidência da Contribuição" },
  { codigo: "75", descricao: "Operação de Aquisição por Substituição Tributária" },
  { codigo: "98", descricao: "Outras Operações de Entrada" },
  { codigo: "99", descricao: "Outras Operações" }
];

export const CST_IPI: Par[] = [
  { codigo: "00", descricao: "Entrada com Recuperação de Crédito" },
  { codigo: "01", descricao: "Entrada Tributada com Alíquota Zero" },
  { codigo: "02", descricao: "Entrada Isenta" },
  { codigo: "03", descricao: "Entrada Não-Tributada" },
  { codigo: "04", descricao: "Entrada Imune" },
  { codigo: "05", descricao: "Entrada com Suspensão" },
  { codigo: "49", descricao: "Outras Entradas" },
  { codigo: "50", descricao: "Saída Tributada" },
  { codigo: "51", descricao: "Saída Tributável com Alíquota Zero" },
  { codigo: "52", descricao: "Saída Isenta" },
  { codigo: "53", descricao: "Saída Não-Tributada" },
  { codigo: "54", descricao: "Saída Imune" },
  { codigo: "55", descricao: "Saída com Suspensão" },
  { codigo: "99", descricao: "Outras Saídas" }
];

/** CFOPs mais usados — fallback caso o download do dataset completo falhe. */
export const CFOP_FALLBACK: Par[] = [
  { codigo: "1102", descricao: "Compra para comercialização" },
  { codigo: "1101", descricao: "Compra para industrialização ou produção rural" },
  { codigo: "1403", descricao: "Compra para comercialização em operação com mercadoria sujeita ao regime de ST" },
  { codigo: "1556", descricao: "Compra de material para uso ou consumo" },
  { codigo: "1551", descricao: "Compra de bem para o ativo imobilizado" },
  { codigo: "1202", descricao: "Devolução de venda de mercadoria adquirida ou recebida de terceiros" },
  { codigo: "2102", descricao: "Compra para comercialização (interestadual)" },
  { codigo: "2403", descricao: "Compra para comercialização em operação com mercadoria sujeita a ST (interestadual)" },
  { codigo: "5102", descricao: "Venda de mercadoria adquirida ou recebida de terceiros" },
  { codigo: "5101", descricao: "Venda de produção do estabelecimento" },
  { codigo: "5405", descricao: "Venda de mercadoria adquirida/recebida de terceiros, sujeita a ST, como contribuinte substituído" },
  { codigo: "5403", descricao: "Venda de mercadoria adquirida/recebida de terceiros, sujeita a ST, como contribuinte substituto" },
  { codigo: "5405", descricao: "Venda de mercadoria sujeita a ST (substituído)" },
  { codigo: "5910", descricao: "Remessa em bonificação, doação ou brinde" },
  { codigo: "5202", descricao: "Devolução de compra para comercialização" },
  { codigo: "6102", descricao: "Venda de mercadoria adquirida ou recebida de terceiros (interestadual)" },
  { codigo: "6404", descricao: "Venda de mercadoria sujeita a ST, como substituído (interestadual)" },
  { codigo: "6108", descricao: "Venda de mercadoria adquirida de terceiros, a não contribuinte (interestadual)" }
];

/** CFOPs oficiais ausentes/incompletos no dataset público — garantidos sempre na tabela. */
const CFOP_COMPLEMENTO: Par[] = [
  { codigo: "1124", descricao: "Industrialização efetuada por outra empresa" },
  { codigo: "2124", descricao: "Industrialização efetuada por outra empresa" },
  { codigo: "1126", descricao: "Compra para utilização na prestação de serviço sujeita ao ICMS" },
  { codigo: "2126", descricao: "Compra para utilização na prestação de serviço sujeita ao ICMS" },
  { codigo: "1128", descricao: "Compra para utilização na prestação de serviço sujeita ao ISSQN" },
  { codigo: "2128", descricao: "Compra para utilização na prestação de serviço sujeita ao ISSQN" }
];

const CFOP_FONTE = "https://raw.githubusercontent.com/jansenfelipe/cfop/1.0/cfop.csv";

/** Baixa a tabela CFOP completa do dataset público; retorna o fallback curado se falhar. */
async function carregarCfop(): Promise<Par[]> {
  try {
    const res = await fetch(CFOP_FONTE, { headers: { Accept: "text/csv" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const pares: Par[] = [];
    for (const linha of csv.split(/\r?\n/)) {
      const m = /^(\d{4});"?(.*?)"?$/.exec(linha.trim());
      if (!m) continue;
      const codigo = m[1];
      // Ignora cabeçalhos de grupo/subgrupo (terminam em 00): não são CFOPs selecionáveis.
      if (codigo.endsWith("00")) continue;
      const descricao = m[2].trim();
      if (descricao) pares.push({ codigo, descricao });
    }
    return pares.length > 50 ? pares : CFOP_FALLBACK;
  } catch {
    return CFOP_FALLBACK;
  }
}

async function gravar(tipo: TipoCodigoFiscal, pares: Par[]) {
  await prisma.codigoFiscal.createMany({
    data: pares.map((p) => ({ tipo, codigo: p.codigo, descricao: p.descricao })),
    skipDuplicates: true
  });
}

/** Popula todos os códigos fiscais de referência (idempotente). Recria para refletir mudanças. */
export async function applyFiscalCodes(): Promise<Record<string, number>> {
  const cfop = await carregarCfop();
  await prisma.codigoFiscal.deleteMany({});
  await gravar("ORIGEM", ORIGEM);
  await gravar("CST_ICMS", CST_ICMS);
  await gravar("CSOSN", CSOSN);
  await gravar("CST_PIS", CST_PISCOFINS);
  await gravar("CST_COFINS", CST_PISCOFINS);
  await gravar("CST_IPI", CST_IPI);
  await gravar("CFOP", [...cfop, ...CFOP_COMPLEMENTO]);

  // NBS e LC116 (serviços) — migrados dos arquivos para a tabela global, por consistência.
  await gravar("NBS" as TipoCodigoFiscal, NBS_LIST.map((i) => ({ codigo: i.code, descricao: i.description })));
  await gravar("LC116" as TipoCodigoFiscal, LC116_LIST.map((i) => ({ codigo: i.code, descricao: i.description })));

  const counts: Record<string, number> = {};
  for (const tipo of ["ORIGEM", "CST_ICMS", "CSOSN", "CST_PIS", "CST_COFINS", "CST_IPI", "CFOP", "NBS", "LC116"]) {
    counts[tipo] = await prisma.codigoFiscal.count({ where: { tipo } });
  }
  return counts;
}
