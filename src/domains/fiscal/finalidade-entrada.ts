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
  // Destinação da compra
  { value: "REVENDA", label: "Revenda / Comercialização" },
  { value: "USO_CONSUMO", label: "Uso e Consumo" },
  { value: "IMOBILIZADO", label: "Ativo Imobilizado" },
  { value: "INDUSTRIALIZACAO", label: "Industrialização / Insumo" },
  // Operações de entrada (não-compra)
  { value: "DEVOLUCAO_VENDA", label: "Devolução de venda (cliente devolveu)" },
  { value: "TRANSFERENCIA", label: "Transferência (entre filiais)" },
  { value: "RETORNO_INDUSTRIALIZACAO", label: "Retorno de industrialização/remessa" },
  { value: "BONIFICACAO", label: "Bonificação / brinde / doação recebida" },
  // Material aplicado na prestação de serviço
  { value: "MATERIAL_SERVICO_ICMS", label: "Material p/ serviço com ICMS (1.126/2.126)" },
  { value: "MATERIAL_SERVICO_ISS", label: "Material p/ serviço com ISS (1.128/2.128)" }
];

const FINALIDADES_VALIDAS: ReadonlySet<string> = new Set(FINALIDADE_OPCOES.map((o) => o.value));

export function isFinalidadeEntrada(value: unknown): value is FinalidadeEntrada {
  return typeof value === "string" && FINALIDADES_VALIDAS.has(value);
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
  IMOBILIZADO: { semSt: ["1551", "2551"], comSt: ["1406", "2406"] },
  // Devolução de venda: 1.202/2.202 (merc. de terceiros); com ST 1.411/2.411.
  DEVOLUCAO_VENDA: { semSt: ["1202", "2202"], comSt: ["1411", "2411"] },
  // Transferência de mercadoria recebida: 1.152/2.152; com ST 1.408/2.408 (p/ comercialização).
  TRANSFERENCIA: { semSt: ["1152", "2152"], comSt: ["1408", "2408"] },
  // Retorno de remessa p/ industrialização: 1.902/2.902 (não há par de ST específico — mantém o mesmo).
  RETORNO_INDUSTRIALIZACAO: { semSt: ["1902", "2902"], comSt: ["1902", "2902"] },
  // Bonificação/brinde/doação recebida: 1.910/2.910.
  BONIFICACAO: { semSt: ["1910", "2910"], comSt: ["1910", "2910"] },
  // Material para uso na prestação de serviço sujeito a ICMS: 1.126/2.126.
  MATERIAL_SERVICO_ICMS: { semSt: ["1126", "2126"], comSt: ["1126", "2126"] },
  // Material para uso na prestação de serviço sujeito a ISSQN: 1.128/2.128.
  MATERIAL_SERVICO_ISS: { semSt: ["1128", "2128"], comSt: ["1128", "2128"] }
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

/**
 * Movimenta estoque quando entra mercadoria física: revenda, insumo e as operações que recolocam
 * mercadoria no estoque — devolução de venda (volta), transferência, retorno de industrialização e
 * bonificação recebida. Uso/consumo e imobilizado não movimentam estoque (viram despesa/ativo).
 */
export function finalidadeMovimentaEstoque(finalidade: FinalidadeEntrada): boolean {
  return (
    finalidade === "REVENDA" ||
    finalidade === "INDUSTRIALIZACAO" ||
    finalidade === "DEVOLUCAO_VENDA" ||
    finalidade === "TRANSFERENCIA" ||
    finalidade === "RETORNO_INDUSTRIALIZACAO" ||
    finalidade === "BONIFICACAO" ||
    finalidade === "MATERIAL_SERVICO_ICMS" ||
    finalidade === "MATERIAL_SERVICO_ISS"
  );
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
  // Transferência e bonificação recebidas viram estoque de revenda → vendem como mercadoria (5102).
  if (finalidade === "TRANSFERENCIA" || finalidade === "BONIFICACAO") return "5102";
  // Devolução de venda e retorno de industrialização não definem CFOP de venda do produto.
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
      // ICMS do ativo: o DIREITO ao crédito existe, mas a apropriação é em 48 parcelas mensais
      // via CIAP (LC 87/96, art. 20, §5º) — escriturada no bloco G da EFD, NÃO no C170 da nota.
      // Como o controle de CIAP ainda não é gerado pelo sistema, não creditamos integral na
      // entrada (superestimaria a apuração). PIS/COFINS de ativo também não são imediatos
      // (depreciação/1:48 — Lei 10.833, art. 3º, §14).
      if (tributo === "ICMS") {
        return {
          recuperavel: false,
          observacao: "Crédito do ativo é em 48 parcelas via CIAP (bloco G) — não creditado integral na entrada; controle com o contador."
        };
      }
      return { recuperavel: false, observacao: "PIS/COFINS de ativo creditam por depreciação/parcelas — não na entrada." };
    case "DEVOLUCAO_VENDA":
      // Devolução de venda: NÃO é crédito de compra — recupera-se o imposto debitado na SAÍDA
      // original, com a mesma carga/CST. Escritura como crédito na entrada (reduz a apuração).
      if (tributo === "ICMS") return { recuperavel: true, observacao: "Devolução de venda — recupera o ICMS debitado na saída original (mesmo CST/carga da venda)." };
      return pisCofinsCreditavel(regime);
    case "TRANSFERENCIA":
      // Transferência entre estabelecimentos do mesmo titular: o crédito de ICMS é transferido da
      // ORIGEM (LC 204/2023, Conv. ICMS 109/2024 — pós ADC 49/STF). PIS/COFINS não geram novo crédito
      // (não há aquisição de terceiro; já creditaram na compra original).
      if (tributo === "ICMS") return { recuperavel: true, observacao: "Transferência — crédito de ICMS transferido da origem (LC 204/2023, Conv. 109/2024)." };
      return { recuperavel: false, observacao: "Transferência entre filiais não gera novo crédito de PIS/COFINS." };
    case "BONIFICACAO":
      // Bonificação/brinde recebido: o ICMS destacado pelo fornecedor credita (houve operação
      // tributada). Atenção ao CUSTO MÉDIO (entrada sem pagamento). PIS/COFINS como mercadoria.
      if (tributo === "ICMS") return { recuperavel: true, observacao: "Bonificação — credita o ICMS destacado; revise o custo médio (entrada sem pagamento)." };
      return pisCofinsCreditavel(regime);
    case "RETORNO_INDUSTRIALIZACAO":
      // Material volta com suspensão/diferimento (saiu suspenso na remessa); o crédito do VALOR
      // AGREGADO da industrialização (CFOP 1.124, insumos+mão de obra do industrializador) é lançado
      // à parte. Conservador: não credita automaticamente na entrada do retorno.
      return { recuperavel: false, observacao: "Retorno de industrialização — material volta com suspensão; o crédito do serviço/insumo do industrializador deve ser lançado à parte. Validar com o contador." };
    case "MATERIAL_SERVICO_ICMS":
      // Material aplicado em serviço sujeito a ICMS (transporte/comunicação): a saída é tributada por
      // ICMS, então o material credita (art. 20, LC 87/96). PIS/COFINS como insumo, só no Lucro Real.
      if (tributo === "ICMS") return { recuperavel: true };
      return pisCofinsCreditavel(regime);
    case "MATERIAL_SERVICO_ISS":
      // Material aplicado em serviço sujeito a ISSQN: NÃO há saída tributada por ICMS → sem crédito de
      // ICMS. PIS/COFINS do insumo do serviço creditam no Lucro Real.
      if (tributo === "ICMS") return { recuperavel: false, observacao: "Serviço sujeito a ISSQN — sem saída de ICMS, logo sem crédito de ICMS sobre o material." };
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

  // O CFOP de SAÍDA do fornecedor (que chega no XML) é o sinal mais forte da OPERAÇÃO — tem
  // prioridade sobre a destinação, e evita classificar devolução/transferência/retorno/bonificação
  // como REVENDA por engano.
  const sufixoCfop = cfop.length === 4 ? cfop.slice(1) : "";
  // Operações de entrada (não-compra):
  if (sufixoCfop === "201" || sufixoCfop === "202" || sufixoCfop === "411" || sufixoCfop === "410")
    return { finalidade: "DEVOLUCAO_VENDA", origem: "HEURISTICA", confianca: 0.8, motivo: "CFOP de origem de devolução de venda." };
  if (sufixoCfop === "151" || sufixoCfop === "152")
    return { finalidade: "TRANSFERENCIA", origem: "HEURISTICA", confianca: 0.8, motivo: "CFOP de origem de transferência entre estabelecimentos." };
  if (sufixoCfop === "902" || sufixoCfop === "903" || sufixoCfop === "124" || sufixoCfop === "125")
    return { finalidade: "RETORNO_INDUSTRIALIZACAO", origem: "HEURISTICA", confianca: 0.75, motivo: "CFOP de origem de retorno/industrialização por terceiro." };
  if (sufixoCfop === "910" || sufixoCfop === "911")
    return { finalidade: "BONIFICACAO", origem: "HEURISTICA", confianca: 0.8, motivo: "CFOP de origem de bonificação/brinde/doação." };
  // Destinação da compra:
  if (sufixoCfop === "551") return { finalidade: "IMOBILIZADO", origem: "HEURISTICA", confianca: 0.6, motivo: "CFOP de origem de venda de ativo imobilizado." };
  if (sufixoCfop === "556") return { finalidade: "USO_CONSUMO", origem: "HEURISTICA", confianca: 0.6, motivo: "CFOP de origem de venda de material de uso/consumo." };
  if (sufixoCfop === "101") return { finalidade: "INDUSTRIALIZACAO", origem: "HEURISTICA", confianca: 0.45, motivo: "CFOP de origem de produção do estabelecimento." };

  if (RE_USO_CONSUMO.test(descricao)) return { finalidade: "USO_CONSUMO", origem: "HEURISTICA", confianca: 0.5, motivo: "Descrição sugere material de uso/consumo." };
  if (RE_INSUMO.test(descricao)) return { finalidade: "INDUSTRIALIZACAO", origem: "HEURISTICA", confianca: 0.5, motivo: "Descrição sugere insumo/matéria-prima." };
  if (RE_IMOBILIZADO.test(descricao)) return { finalidade: "IMOBILIZADO", origem: "HEURISTICA", confianca: 0.4, motivo: "Descrição sugere bem do ativo." };

  return { finalidade: "REVENDA", origem: "HEURISTICA", confianca: 0.25, motivo: "Sem indício específico — assumida revenda (caso predominante)." };
}
