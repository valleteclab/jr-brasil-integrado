/**
 * Crédito presumido de ICMS por NCM — cálculo puro, para o bloco E da EFD.
 *
 * O caso que motivou: Decreto BA 23.481/2025 concede crédito presumido ao contribuinte do
 * regime de conta corrente fiscal nas saídas internas de produtos de informática do Anexo
 * Único, e exige estornar, no mesmo percentual, os créditos destacados nas aquisições desses
 * mesmos produtos.
 *
 * Nada aqui é específico da Bahia nem daquele decreto: a UF, o percentual, os NCM e os códigos
 * de ajuste vêm todos do cadastro da empresa. Outro estado com benefício parecido usa o mesmo
 * código, só com outra regra.
 *
 * O que ESTE módulo não faz, de propósito:
 *   - não mexe na NF-e. A saída continua com ICMS destacado integral; o benefício é de
 *     apuração, não de documento.
 *   - não decide se a empresa tem direito ao benefício. Habilitar é decisão do contribuinte.
 */

import type { SpedDocumento, SpedItemCatalogo } from "./types";

/** Regra do benefício, como está no cadastro da empresa. */
export type RegraCreditoPresumido = {
  /** Percentual do ICMS da saída apropriado como crédito presumido (ex.: 61.11). */
  percentual: number;
  /**
   * NCM contemplados. Aceita o código completo (84715010) ou o prefixo da posição/subposição
   * (8471), porque um anexo de lei às vezes lista a posição inteira. Pontos e espaços são
   * ignorados na comparação.
   */
  ncms: string[];
  /**
   * CFOP de saída que entram no benefício. Vazio → todas as saídas internas (5xxx) com ICMS
   * debitado. Serve para limitar a venda quando o benefício não alcança transferência,
   * devolução ou remessa.
   */
  cfops: string[];
};

export type ApuracaoCreditoPresumido = {
  /** ICMS debitado nas saídas contempladas — base do crédito presumido. */
  icmsSaidasContempladas: number;
  /** Valor das operações de saída contempladas (alimenta o E115 declaratório). */
  valorSaidasContempladas: number;
  /** Crédito presumido apropriado: icmsSaidasContempladas × percentual. */
  creditoPresumido: number;
  /** ICMS creditado nas entradas dos mesmos produtos. */
  icmsEntradasContempladas: number;
  /** Estorno exigido: icmsEntradasContempladas × percentual (mesmo percentual do crédito). */
  estornoCredito: number;
  /** NCM efetivamente encontrados nas saídas, para o usuário conferir o que entrou. */
  ncmsNasSaidas: string[];
  /** NCM da regra que não apareceram em nenhuma saída do período (apenas informativo). */
  ncmsSemMovimento: string[];
};

/** Só os dígitos: "8471.50.10" e "84715010" são o mesmo NCM. */
export function normalizarNcm(ncm: string | null | undefined): string {
  return (ncm ?? "").replace(/\D/g, "");
}

/**
 * O NCM do item está contemplado pela regra?
 *
 * Compara por prefixo para que a posição (8471) alcance seus itens (84715010). A comparação é
 * sempre do NCM da regra contra o do item, nunca o contrário: um anexo que lista "8471" deve
 * pegar "84715010", mas um anexo que lista "84715010" NÃO pode pegar um "8471" genérico.
 */
export function ncmContemplado(ncmItem: string | null | undefined, ncmsRegra: string[]): boolean {
  const item = normalizarNcm(ncmItem);
  if (!item) return false;
  return ncmsRegra.some((bruto) => {
    const regra = normalizarNcm(bruto);
    return regra.length > 0 && item.startsWith(regra);
  });
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Saída interna: CFOP do grupo 5 (mesma UF). Interestadual (6) e exterior (7) ficam fora. */
const ehSaidaInterna = (cfop: string) => cfop.startsWith("5");

/**
 * Apura o crédito presumido e o estorno do período.
 *
 * Varre os itens dos documentos e não as linhas analíticas (C190) porque o benefício é por
 * NCM, e o C190 agrega por CST/CFOP/alíquota — a informação do NCM já se perdeu lá.
 */
export function apurarCreditoPresumido(
  documentos: SpedDocumento[],
  itensCatalogo: SpedItemCatalogo[],
  regra: RegraCreditoPresumido
): ApuracaoCreditoPresumido {
  const ncmPorItem = new Map(itensCatalogo.map((i) => [i.codigo, i.ncm]));
  const cfopsPermitidos = new Set(regra.cfops.map((c) => c.replace(/\D/g, "")).filter(Boolean));

  let icmsSaidas = 0;
  let valorSaidas = 0;
  let icmsEntradas = 0;
  const ncmsVistos = new Set<string>();

  for (const doc of documentos) {
    if (doc.cancelado) continue;
    for (const item of doc.itens) {
      const ncm = ncmPorItem.get(item.codigoItem);
      if (!ncmContemplado(ncm, regra.ncms)) continue;

      if (doc.tipo === "SAIDA") {
        if (!ehSaidaInterna(item.cfop)) continue;
        if (cfopsPermitidos.size > 0 && !cfopsPermitidos.has(item.cfop)) continue;
        // Sem ICMS debitado não há o que presumir: isenta, não tributada e ST ficam fora.
        if (item.valorIcms <= 0) continue;
        icmsSaidas += item.valorIcms;
        valorSaidas += item.valorItem - item.valorDesconto;
        ncmsVistos.add(normalizarNcm(ncm));
      } else {
        // Entradas: o estorno alcança o crédito que foi efetivamente apropriado.
        if (item.valorIcms <= 0) continue;
        icmsEntradas += item.valorIcms;
      }
    }
  }

  icmsSaidas = round2(icmsSaidas);
  icmsEntradas = round2(icmsEntradas);
  const fator = regra.percentual / 100;

  const ncmsNasSaidas = Array.from(ncmsVistos).sort();
  const ncmsSemMovimento = regra.ncms
    .map(normalizarNcm)
    .filter((regraNcm) => regraNcm.length > 0 && !ncmsNasSaidas.some((visto) => visto.startsWith(regraNcm)))
    .sort();

  return {
    icmsSaidasContempladas: icmsSaidas,
    valorSaidasContempladas: round2(valorSaidas),
    creditoPresumido: round2(icmsSaidas * fator),
    icmsEntradasContempladas: icmsEntradas,
    estornoCredito: round2(icmsEntradas * fator),
    ncmsNasSaidas,
    ncmsSemMovimento: Array.from(new Set(ncmsSemMovimento))
  };
}
