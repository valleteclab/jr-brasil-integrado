/**
 * Acompanhamento de Entradas (espelho do Livro Registro de Entradas, modelo P1) —
 * o relatório que a contabilidade entrega, gerado pelo próprio ERP.
 *
 * Reusa a MESMA carga do SPED Fiscal (carregarSpedInput): entradas conferidas do ERP +
 * XMLs avulsos, com CFOP de entrada e crédito já resolvidos pela precedência
 * manual → regra De/Para → heurística. Ou seja: o relatório bate com o arquivo EFD.
 *
 * Colunas (padrão do livro): Valor Contábil | Base de Cálculo | Alíq. | Imposto Creditado |
 * Isentas/Não Tributadas | Outras — agrupado por CFOP, com subtotais e total geral.
 */

import type { TenantScope } from "@/lib/auth/dev-session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { carregarSpedInput } from "@/domains/fiscal/sped/dados";
import { formatBrl } from "@/lib/formatters/currency";

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export type LivroEntradaLinha = {
  data: string; // dd/mm/aaaa
  numero: string;
  serie: string;
  fornecedor: string;
  uf: string;
  cfop: string;
  valorContabil: number;
  baseCalculo: number;
  /** Alíquota predominante da parcela tributada (vazio quando sem crédito). */
  aliquota: number | null;
  imposto: number;
  isentas: number;
  outras: number;
  /** "XML" quando o documento veio de XML avulso (fora do fluxo de entradas do ERP). */
  origem: "ERP" | "XML";
};

export type LivroEntradasGrupo = {
  cfop: string;
  linhas: LivroEntradaLinha[];
  totais: { valorContabil: number; baseCalculo: number; imposto: number; isentas: number; outras: number };
};

export type LivroEntradasReport = {
  competencia: string; // "05/2026"
  inicio: string;
  fim: string;
  documentos: number;
  grupos: LivroEntradasGrupo[];
  totais: {
    valorContabil: number;
    baseCalculo: number;
    imposto: number;
    isentas: number;
    outras: number;
    valorContabilFmt: string;
    baseCalculoFmt: string;
    impostoFmt: string;
    isentasFmt: string;
    outrasFmt: string;
  };
  avisos: string[];
};

// CSTs de ICMS que classificam a parcela sem débito/crédito como "Isentas/Não tributadas"
// no livro (30 isenta c/ ST, 40 isenta, 41 não tributada). Demais sem crédito vão em "Outras".
const CST_ISENTAS = new Set(["30", "40", "41"]);

export async function livroEntradasReport(
  params?: { mes?: number; ano?: number },
  scopeArg?: TenantScope
): Promise<LivroEntradasReport> {
  const scope = scopeArg ?? (await getDevelopmentTenantScope());
  const agora = new Date();
  const mes = params?.mes && params.mes >= 1 && params.mes <= 12 ? params.mes : agora.getMonth() + 1;
  const ano = params?.ano && params.ano >= 2000 ? params.ano : agora.getFullYear();

  const input = await carregarSpedInput(scope, { ano, mes });
  const participantes = new Map(input.participantes.map((p) => [p.codigo, p]));

  const grupos = new Map<string, LivroEntradasGrupo>();
  let documentos = 0;

  for (const doc of input.documentos) {
    if (doc.tipo !== "ENTRADA" || doc.cancelado) continue;
    documentos++;
    const participante = doc.codigoParticipante ? participantes.get(doc.codigoParticipante) : null;
    const fornecedor = participante?.nome ?? "—";
    const uf = participante?.uf ?? "";
    const dataDoc = doc.dataEntradaSaida ?? doc.dataEmissao;
    const data = dataDoc ? dataDoc.toLocaleDateString("pt-BR") : "—";

    // Quebra os itens do documento por CFOP de entrada (uma linha do livro por nota×CFOP).
    const porCfop = new Map<
      string,
      { contabil: number; base: number; imposto: number; isentas: number; aliquotas: Map<number, number> }
    >();
    for (const item of doc.itens) {
      const acc = porCfop.get(item.cfop) ?? { contabil: 0, base: 0, imposto: 0, isentas: 0, aliquotas: new Map() };
      const liquido = round2(item.valorItem - item.valorDesconto);
      acc.contabil = round2(acc.contabil + liquido + item.valorIcmsSt + item.valorIpi);
      acc.base = round2(acc.base + item.baseIcms);
      acc.imposto = round2(acc.imposto + item.valorIcms);
      if (item.valorIcms > 0 && item.aliquotaIcms > 0) {
        acc.aliquotas.set(item.aliquotaIcms, round2((acc.aliquotas.get(item.aliquotaIcms) ?? 0) + item.valorIcms));
      }
      const cst2 = item.cstIcms.slice(-2);
      if (item.valorIcms <= 0 && CST_ISENTAS.has(cst2)) {
        acc.isentas = round2(acc.isentas + liquido);
      }
      porCfop.set(item.cfop, acc);
    }

    // Frete/seguro/despesas da nota entram no valor contábil da linha de maior valor
    // (nota de um único CFOP fica idêntica ao total do documento, como no livro).
    const extras = round2(doc.valorFrete + doc.valorSeguro + doc.outrasDespesas);
    if (extras > 0 && porCfop.size > 0) {
      const maior = Array.from(porCfop.entries()).sort((a, b) => b[1].contabil - a[1].contabil)[0][1];
      maior.contabil = round2(maior.contabil + extras);
    }

    for (const [cfop, acc] of porCfop) {
      // Alíquota predominante: a que carrega o maior valor de imposto na linha.
      const aliquota =
        acc.aliquotas.size > 0
          ? Array.from(acc.aliquotas.entries()).sort((a, b) => b[1] - a[1])[0][0]
          : null;
      const outras = round2(Math.max(acc.contabil - acc.base - acc.isentas, 0));
      const linha: LivroEntradaLinha = {
        data,
        numero: doc.numero ?? "—",
        serie: doc.serie ?? "—",
        fornecedor,
        uf,
        cfop,
        valorContabil: acc.contabil,
        baseCalculo: acc.base,
        aliquota,
        imposto: acc.imposto,
        isentas: acc.isentas,
        outras,
        origem: doc.rotulo.includes("XML avulso") ? "XML" : "ERP"
      };
      const grupo = grupos.get(cfop) ?? {
        cfop,
        linhas: [],
        totais: { valorContabil: 0, baseCalculo: 0, imposto: 0, isentas: 0, outras: 0 }
      };
      grupo.linhas.push(linha);
      grupo.totais.valorContabil = round2(grupo.totais.valorContabil + linha.valorContabil);
      grupo.totais.baseCalculo = round2(grupo.totais.baseCalculo + linha.baseCalculo);
      grupo.totais.imposto = round2(grupo.totais.imposto + linha.imposto);
      grupo.totais.isentas = round2(grupo.totais.isentas + linha.isentas);
      grupo.totais.outras = round2(grupo.totais.outras + linha.outras);
      grupos.set(cfop, grupo);
    }
  }

  const gruposOrdenados = Array.from(grupos.values())
    .map((g) => ({ ...g, linhas: g.linhas.sort((a, b) => a.data.localeCompare(b.data) || a.numero.localeCompare(b.numero)) }))
    .sort((a, b) => a.cfop.localeCompare(b.cfop));

  const totais = gruposOrdenados.reduce(
    (acc, g) => ({
      valorContabil: round2(acc.valorContabil + g.totais.valorContabil),
      baseCalculo: round2(acc.baseCalculo + g.totais.baseCalculo),
      imposto: round2(acc.imposto + g.totais.imposto),
      isentas: round2(acc.isentas + g.totais.isentas),
      outras: round2(acc.outras + g.totais.outras)
    }),
    { valorContabil: 0, baseCalculo: 0, imposto: 0, isentas: 0, outras: 0 }
  );

  return {
    competencia: `${String(mes).padStart(2, "0")}/${ano}`,
    inicio: input.periodo.inicio.toISOString(),
    fim: input.periodo.fim.toISOString(),
    documentos,
    grupos: gruposOrdenados,
    totais: {
      ...totais,
      valorContabilFmt: formatBrl(totais.valorContabil),
      baseCalculoFmt: formatBrl(totais.baseCalculo),
      impostoFmt: formatBrl(totais.imposto),
      isentasFmt: formatBrl(totais.isentas),
      outrasFmt: formatBrl(totais.outras)
    },
    avisos: input.avisos.filter((a) => a.toLowerCase().includes("entrada") || a.includes("XML"))
  };
}

const num = (v: number) => v.toFixed(2).replace(".", ",");

/** CSV (separador ";", padrão Excel pt-BR) do livro de entradas. */
export function livroEntradasCsv(report: LivroEntradasReport): string {
  const linhas: string[] = [];
  linhas.push(`Acompanhamento de Entradas;Competência ${report.competencia}`);
  linhas.push("Data;Nota;Série;Fornecedor;UF;CFOP;Origem;Valor Contábil;Base de Cálculo;Alíquota;Imposto Creditado;Isentas/Não Trib.;Outras");
  for (const grupo of report.grupos) {
    for (const l of grupo.linhas) {
      linhas.push(
        [
          l.data,
          l.numero,
          l.serie,
          `"${l.fornecedor.replace(/"/g, "'")}"`,
          l.uf,
          l.cfop,
          l.origem,
          num(l.valorContabil),
          num(l.baseCalculo),
          l.aliquota != null ? num(l.aliquota) : "",
          num(l.imposto),
          num(l.isentas),
          num(l.outras)
        ].join(";")
      );
    }
    linhas.push(
      `;;;;;Total CFOP ${grupo.cfop};;${num(grupo.totais.valorContabil)};${num(grupo.totais.baseCalculo)};;${num(grupo.totais.imposto)};${num(grupo.totais.isentas)};${num(grupo.totais.outras)}`
    );
  }
  linhas.push(
    `;;;;;Total Geral;;${num(report.totais.valorContabil)};${num(report.totais.baseCalculo)};;${num(report.totais.imposto)};${num(report.totais.isentas)};${num(report.totais.outras)}`
  );
  return linhas.join("\r\n");
}
