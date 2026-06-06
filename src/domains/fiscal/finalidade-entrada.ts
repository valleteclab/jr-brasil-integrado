/**
 * Classificação de finalidade/destinação de itens em NF-e de ENTRADA (compra) e seus
 * efeitos fiscais. Funções puras (sem I/O), no estilo de cfop.ts: recebem contexto pronto
 * e devolvem decisões determinísticas. A "memória" do produto e as regras De/Para
 * configuráveis vivem na camada de aplicação (finalidade-regra-use-cases.ts).
 *
 * A finalidade do COMPRADOR — não o CFOP do fornecedor (que é a saída dele) — determina:
 *  - o CFOP de ENTRADA correto (escrituração);
 *  - o direito a crédito de ICMS/PIS/COFINS (depende também do regime);
 *  - se o item vira estoque de mercadoria/insumo ou é despesa/ativo.
 */

import type { FinalidadeEntrada, RegimeTributario, TipoTributo } from "@prisma/client";

export type { FinalidadeEntrada };

export const FINALIDADE_OPCOES: Array<{ value: FinalidadeEntrada; label: string }> = [
  { value: "REVENDA", label: "Revenda / Comercialização" },
  { value: "USO_CONSUMO", label: "Uso e Consumo" },
  { value: "IMOBILIZADO", label: "Ativo Imobilizado" },
  { value: "INDUSTRIALIZACAO", label: "Industrialização / Insumo" }
];

export function isFinalidadeEntrada(value: unknown): value is FinalidadeEntrada {
  return value === "REVENDA" || value === "USO_CONSUMO" || value === "IMOBILIZADO" || value === "INDUSTRIALIZACAO";
}

// ─── CFOP de entrada ────────────────────────────────────────────────────────────

/**
 * Matriz de CFOP de entrada por finalidade. Cada par é [interno (1xxx), interestadual (2xxx)].
 * Exterior (3xxx, importação direta) está fora do escopo atual.
 */
const CFOP_ENTRADA: Record<FinalidadeEntrada, { semSt: [string, string]; comSt: [string, string] }> = {
  REVENDA: { semSt: ["1102", "2102"], comSt: ["1403", "2403"] },
  INDUSTRIALIZACAO: { semSt: ["1101", "2101"], comSt: ["1401", "2401"] },
  USO_CONSUMO: { semSt: ["1556", "2556"], comSt: ["1407", "2407"] },
  IMOBILIZADO: { semSt: ["1551", "2551"], comSt: ["1406", "2406"] }
};

export type CfopEntradaContext = {
  /** UF do fornecedor diferente da UF da empresa (operação interestadual). */
  interestadual: boolean;
  /** Mercadoria sujeita a substituição tributária de ICMS. */
  st: boolean;
};

/** Retorna o CFOP de entrada derivado da finalidade e do contexto da operação. */
export function resolveCfopEntrada(finalidade: FinalidadeEntrada, ctx: CfopEntradaContext): string {
  const par = ctx.st ? CFOP_ENTRADA[finalidade].comSt : CFOP_ENTRADA[finalidade].semSt;
  return par[ctx.interestadual ? 1 : 0];
}

// ─── Movimentação de estoque ────────────────────────────────────────────────────

/** Revenda e industrialização viram estoque; uso/consumo e imobilizado não. */
export function finalidadeMovimentaEstoque(finalidade: FinalidadeEntrada): boolean {
  return finalidade === "REVENDA" || finalidade === "INDUSTRIALIZACAO";
}

// ─── CFOP de venda padrão do produto ────────────────────────────────────────────

/**
 * CFOP de SAÍDA (venda) padrão para o produto, conforme a finalidade com que ele entrou.
 * É o CFOP que o produto usará quando NÓS o vendermos — não o CFOP do fornecedor nem o de
 * entrada. Devolve o CFOP interno (5xxx); a emissão deriva interno/interestadual e ST no momento
 * da venda. Uso/consumo e imobilizado não são revendidos, então não têm CFOP de venda.
 *
 * Mercadoria substituída (ST): retorna null de propósito — não fixamos um CFOP no produto, para
 * que a emissão derive 5405 (interno) / 6404 (interestadual) a partir do CST 60/CSOSN 500. Fixar
 * 5102 aqui impediria essa derivação (CFOP explícito do produto prevalece na emissão).
 */
export function cfopVendaPadrao(
  finalidade: FinalidadeEntrada | null | undefined,
  ctx: { st?: boolean } = {}
): string | null {
  if (ctx.st) return null; // ST: a emissão deriva 5405/6404 pelo CST de substituído.
  if (finalidade === "REVENDA") return "5102"; // venda de mercadoria adquirida de terceiros
  if (finalidade === "INDUSTRIALIZACAO") return "5101"; // venda de produção do estabelecimento
  return null;
}

// ─── Crédito recuperável ────────────────────────────────────────────────────────

export type CreditoResultado = {
  recuperavel: boolean;
  observacao?: string;
};

const SEM_CREDITO: CreditoResultado = { recuperavel: false };

/** Regimes que não apropriam crédito de ICMS/PIS/COFINS na entrada. */
function regimeSemCredito(regime: RegimeTributario): boolean {
  return regime === "SIMPLES_NACIONAL" || regime === "SIMPLES_EXCESSO_SUBLIMITE" || regime === "MEI";
}

/** PIS/COFINS só são não-cumulativos (creditam) no Lucro Real. */
function pisCofinsCreditavel(regime: RegimeTributario): CreditoResultado {
  if (regime === "LUCRO_REAL") return { recuperavel: true };
  return { recuperavel: false, observacao: "PIS/COFINS cumulativos no Lucro Presumido — sem crédito." };
}

export type CreditoContexto = {
  /** Mercadoria com ICMS retido por substituição tributária (CST 10/30/60/70 ou CSOSN 201/202/203/500). */
  st?: boolean;
};

/**
 * Se o tributo de entrada é recuperável (gera crédito) conforme a finalidade do item e o
 * regime da empresa. Só decide para ICMS/PIS/COFINS; demais tributos retornam não-recuperável
 * (mantenha o que veio do XML para esses casos).
 *
 * Substituição tributária (ST): quando o ICMS da mercadoria já foi recolhido por ST, não há
 * ICMS próprio a creditar na entrada — o imposto da cadeia foi pago de forma definitiva pelo
 * substituto. Na revenda o item também sai sem débito de ICMS (CST 60 / CFOP x405), então a
 * operação é neutra (não credita, não debita). Isso vale para qualquer regime de apuração.
 */
export function creditoPorFinalidade(
  finalidade: FinalidadeEntrada,
  regime: RegimeTributario,
  tributo: TipoTributo,
  ctx: CreditoContexto = {}
): CreditoResultado {
  if (tributo !== "ICMS" && tributo !== "PIS" && tributo !== "COFINS") return SEM_CREDITO;
  if (regimeSemCredito(regime)) return { recuperavel: false, observacao: "Regime do Simples/MEI não credita na entrada." };

  // ICMS pago por ST não gera crédito (independe da finalidade e do regime).
  if (tributo === "ICMS" && ctx.st) {
    return { recuperavel: false, observacao: "ICMS pago por substituição tributária (ST) — sem crédito; na revenda também não há débito." };
  }

  switch (finalidade) {
    case "REVENDA":
    case "INDUSTRIALIZACAO":
      // Mercadoria/insumo: ICMS credita; PIS/COFINS só no Lucro Real.
      if (tributo === "ICMS") return { recuperavel: true };
      return pisCofinsCreditavel(regime);
    case "USO_CONSUMO":
      // ICMS de uso/consumo postergado (LC 87/96, hoje até 2033); PIS/COFINS em regra não creditam.
      if (tributo === "ICMS") return { recuperavel: false, observacao: "Crédito de ICMS de uso/consumo postergado para 2033." };
      return { recuperavel: false, observacao: "Uso/consumo não gera crédito de PIS/COFINS." };
    case "IMOBILIZADO":
      // ICMS do ativo: crédito em 48 parcelas via CIAP; PIS/COFINS só no Lucro Real.
      if (tributo === "ICMS") return { recuperavel: true, observacao: "Crédito de ICMS do ativo em 48 parcelas (CIAP)." };
      return pisCofinsCreditavel(regime);
    default:
      return SEM_CREDITO;
  }
}

// ─── Sugestão heurística (sem I/O) ──────────────────────────────────────────────

export type FinalidadeSugestaoItem = {
  ncm?: string | null;
  cfop?: string | null;
  descricao?: string | null;
};

export type FinalidadeSugestao = {
  finalidade: FinalidadeEntrada;
  origem: "HEURISTICA";
  /** 0..1 — confiança da heurística (a resolução final pode preferir regra/memória). */
  confianca: number;
  motivo: string;
};

// Palavras-chave fortes na descrição. O NCM NÃO é usado como sinal: capítulos como 84/87
// abrigam tanto bens do ativo quanto autopeças de revenda, então classificar por capítulo
// gera falso "imobilizado" para a maioria dos itens de uma distribuidora de peças.
const RE_USO_CONSUMO = /\b(uso e? consumo|material de limpeza|limpeza|escrit[oó]rio|copa|higiene|expediente|papelaria)\b/i;
const RE_IMOBILIZADO = /\b(im[ao]bilizado|ativo fixo|bem do ativo)\b/i;
const RE_INSUMO = /\b(mat[eé]ria[- ]prima|insumo|para industrializa)\b/i;

/**
 * Sugestão de finalidade puramente heurística, a partir de sinais FORTES: o CFOP de saída do
 * fornecedor (sufixo 551/556/101) e palavras-chave inequívocas da descrição. Quando não há
 * sinal forte, o fallback é REVENDA (caso predominante de uma distribuidora/autopeças) — é mais
 * seguro do que arriscar imobilizado/uso-consumo por pistas fracas. A camada de aplicação
 * prefere, nesta ordem: finalidade memorizada no produto > regra De/Para > IA/manual > esta heurística.
 */
export function sugerirFinalidadeEntrada(item: FinalidadeSugestaoItem): FinalidadeSugestao {
  const descricao = item.descricao ?? "";
  const cfop = (item.cfop ?? "").replace(/\D/g, "");

  // CFOP de SAÍDA do fornecedor com sufixo 551/556 sinaliza venda de ativo/uso-consumo.
  const sufixoCfop = cfop.length === 4 ? cfop.slice(1) : "";
  if (sufixoCfop === "551") return { finalidade: "IMOBILIZADO", origem: "HEURISTICA", confianca: 0.6, motivo: "CFOP de origem de venda de ativo imobilizado." };
  if (sufixoCfop === "556") return { finalidade: "USO_CONSUMO", origem: "HEURISTICA", confianca: 0.6, motivo: "CFOP de origem de venda de material de uso/consumo." };
  if (sufixoCfop === "101") return { finalidade: "INDUSTRIALIZACAO", origem: "HEURISTICA", confianca: 0.45, motivo: "CFOP de origem de produção do estabelecimento." };

  if (RE_USO_CONSUMO.test(descricao)) return { finalidade: "USO_CONSUMO", origem: "HEURISTICA", confianca: 0.5, motivo: "Descrição sugere material de uso/consumo." };
  if (RE_INSUMO.test(descricao)) return { finalidade: "INDUSTRIALIZACAO", origem: "HEURISTICA", confianca: 0.5, motivo: "Descrição sugere insumo/matéria-prima." };
  if (RE_IMOBILIZADO.test(descricao)) return { finalidade: "IMOBILIZADO", origem: "HEURISTICA", confianca: 0.4, motivo: "Descrição sugere bem do ativo." };

  return { finalidade: "REVENDA", origem: "HEURISTICA", confianca: 0.25, motivo: "Sem indício específico — assumida revenda (caso predominante)." };
}
