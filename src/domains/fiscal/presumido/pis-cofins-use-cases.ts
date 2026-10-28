import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { grupoMonofasicoDoNcm } from "@/domains/fiscal/simples/monofasico-ncm";
import { PresumidoError } from "./apuracao-presumido-use-cases";

/**
 * APURAÇÃO MENSAL DO PIS/COFINS.
 *
 *  - CUMULATIVO (lucro presumido): PIS 0,65% e COFINS 3% sobre a receita bruta, sem crédito
 *    (Lei 9.718/1998, art. 2º e 8º; Lei 10.833/2003, art. 10 I);
 *  - NÃO CUMULATIVO (lucro real): PIS 1,65% e COFINS 7,6%, com desconto de créditos
 *    (Leis 10.637/2002 e 10.833/2003).
 *
 * O que sai da base, e que normalmente ninguém segrega:
 *  - revenda de produto MONOFÁSICO: a indústria já recolheu por toda a cadeia, e o revendedor
 *    aplica alíquota zero (Leis 10.147/2000, 10.485/2002, 10.833/2003 art. 58-A e seguintes);
 *  - itens com CST de alíquota zero, isenção, suspensão, não incidência ou substituição;
 *  - descontos incondicionais e notas canceladas.
 *
 * ESTIMATIVA GERENCIAL — o valor oficial é o da EFD-Contribuições/DCTF da contabilidade.
 */

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export const ALIQUOTAS = {
  CUMULATIVO: { pis: 0.0065, cofins: 0.03, rotulo: "Cumulativo (lucro presumido)", base: "Lei 9.718/98, arts. 2º e 8º" },
  NAO_CUMULATIVO: { pis: 0.0165, cofins: 0.076, rotulo: "Não cumulativo (lucro real)", base: "Leis 10.637/02 e 10.833/03" }
} as const;

export const DARF_PIS_COFINS = {
  CUMULATIVO: { pis: "8109", cofins: "2172" },
  NAO_CUMULATIVO: { pis: "6912", cofins: "5856" }
} as const;

/** CSTs de saída que NÃO geram débito de PIS/COFINS. */
const CST_SEM_DEBITO: Record<string, string> = {
  "04": "Monofásico — revenda com alíquota zero (tributação concentrada na indústria)",
  "05": "Substituição tributária",
  "06": "Alíquota zero",
  "07": "Operação isenta",
  "08": "Operação sem incidência",
  "09": "Operação com suspensão"
};

export type LinhaPisCofins = {
  notaId: string;
  modelo: string;
  numero: string;
  data: string;
  descricao: string;
  receita: number;
  excluida: number;
  motivoExclusao: string | null;
};

export type ApuracaoPisCofins = {
  empresa: { razaoSocial: string; regime: string };
  periodo: { ano: number; mes: number; rotulo: string; vencimento: string };
  regimeApuracao: "CUMULATIVO" | "NAO_CUMULATIVO";
  regimeReceita: "COMPETENCIA" | "CAIXA";
  aliquotas: { pis: number; cofins: number; rotulo: string; base: string };
  darf: { pis: string; cofins: string };
  totais: {
    receitaBruta: number;
    exclusoes: number;
    baseCalculo: number;
    pisDebito: number;
    cofinsDebito: number;
    pisCredito: number;
    cofinsCredito: number;
    pisRetido: number;
    cofinsRetido: number;
    pisRecolher: number;
    cofinsRecolher: number;
    totalRecolher: number;
  };
  linhas: LinhaPisCofins[];
  avisos: string[];
};

const SELECT_NOTA = {
  id: true,
  modelo: true,
  numero: true,
  emitidaEm: true,
  criadoEm: true,
  destinatarioNome: true,
  valorServicos: true,
  valorProdutos: true,
  valorPisRetido: true,
  valorCofinsRetido: true,
  itens: {
    select: {
      valorTotal: true,
      desconto: true,
      ncm: true,
      cstPis: true,
      descricao: true,
      produto: { select: { fiscal: { select: { pisCofinsMonofasico: true } } } }
    }
  }
} as const;

type NotaPis = {
  id: string;
  modelo: string;
  numero: string | null;
  emitidaEm: Date | null;
  criadoEm: Date;
  destinatarioNome: string | null;
  valorServicos: unknown;
  valorProdutos: unknown;
  valorPisRetido: unknown;
  valorCofinsRetido: unknown;
  itens: Array<{
    valorTotal: unknown;
    desconto: unknown;
    ncm: string | null;
    cstPis: string | null;
    descricao: string | null;
    produto: { fiscal: { pisCofinsMonofasico: boolean } | null } | null;
  }>;
};

/** Separa a receita da nota entre o que entra na base e o que é excluído, com o motivo. */
function separarReceita(nota: NotaPis): { tributavel: number; excluida: number; motivo: string | null } {
  const servicos = Number(nota.valorServicos ?? 0);
  if (nota.modelo === "NFSE" || nota.itens.length === 0) {
    // Serviço não tem monofásico: a receita toda compõe a base.
    const produtos = Number(nota.valorProdutos ?? 0);
    return { tributavel: round2(servicos + produtos), excluida: 0, motivo: null };
  }

  let tributavel = servicos;
  let excluida = 0;
  const motivos = new Set<string>();
  for (const item of nota.itens) {
    const liquido = Number(item.valorTotal ?? 0) - Number(item.desconto ?? 0);
    if (liquido <= 0) continue;
    const cst = (item.cstPis ?? "").padStart(2, "0");
    const monofasico = Boolean(item.produto?.fiscal?.pisCofinsMonofasico) || Boolean(grupoMonofasicoDoNcm(item.ncm));
    if (CST_SEM_DEBITO[cst]) {
      excluida += liquido;
      motivos.add(CST_SEM_DEBITO[cst]);
    } else if (monofasico) {
      excluida += liquido;
      motivos.add(CST_SEM_DEBITO["04"]);
    } else {
      tributavel += liquido;
    }
  }
  return {
    tributavel: round2(tributavel),
    excluida: round2(excluida),
    motivo: motivos.size ? [...motivos].join(" · ") : null
  };
}

/** Dia 25 do mês seguinte, antecipando para o dia útil anterior (Lei 11.933/2009, art. 1º). */
export function vencimentoPisCofins(ano: number, mes: number): Date {
  const d = new Date(Date.UTC(ano, mes, 25));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export async function apuracaoPisCofins(
  scope: TenantScope,
  params: { ano: number; mes: number }
): Promise<ApuracaoPisCofins> {
  const { ano, mes } = params;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new PresumidoError("Mês inválido (1 a 12).");
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new PresumidoError("Ano inválido.");

  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId, tenantId: scope.tenantId },
    select: { razaoSocial: true, regimeTributario: true }
  });
  if (!empresa) throw new PresumidoError("Empresa não encontrada no escopo atual.");

  const config = await prisma.configuracaoFiscal.findUnique({
    where: { empresaId: scope.empresaId },
    select: { regimeReceitaCaixa: true }
  });
  const regimeReceita = config?.regimeReceitaCaixa ? "CAIXA" : "COMPETENCIA";
  const regimeApuracao = empresa.regimeTributario === "LUCRO_REAL" ? "NAO_CUMULATIVO" : "CUMULATIVO";
  const aliquotas = ALIQUOTAS[regimeApuracao];

  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 1));
  const avisos: string[] = [];
  const linhas: LinhaPisCofins[] = [];
  let receitaBruta = 0;
  let exclusoes = 0;
  let pisRetido = 0;
  let cofinsRetido = 0;

  const registrar = (nota: NotaPis, proporcao: number, data: Date) => {
    const { tributavel, excluida, motivo } = separarReceita(nota);
    const receita = round2(tributavel * proporcao);
    const fora = round2(excluida * proporcao);
    if (receita <= 0 && fora <= 0) return;
    receitaBruta = round2(receitaBruta + receita + fora);
    exclusoes = round2(exclusoes + fora);
    pisRetido = round2(pisRetido + Number(nota.valorPisRetido ?? 0) * proporcao);
    cofinsRetido = round2(cofinsRetido + Number(nota.valorCofinsRetido ?? 0) * proporcao);
    linhas.push({
      notaId: nota.id,
      modelo: nota.modelo,
      numero: nota.numero ?? "",
      data: data.toISOString(),
      descricao: nota.destinatarioNome ?? "",
      receita,
      excluida: fora,
      motivoExclusao: motivo
    });
  };

  if (regimeReceita === "CAIXA") {
    const titulos = await prisma.contaReceber.findMany({
      where: { ...scopedByTenantCompany(scope), pagoEm: { gte: inicio, lt: fim }, valorPago: { gt: 0 } },
      select: { valorPago: true, pagoEm: true, notaFiscal: { select: SELECT_NOTA } }
    });
    let semNota = 0;
    for (const t of titulos) {
      const nota = t.notaFiscal as unknown as NotaPis | null;
      if (!nota) {
        semNota += 1;
        continue;
      }
      const totalNota = Number(nota.valorServicos ?? 0) + Number(nota.valorProdutos ?? 0);
      const recebido = Number(t.valorPago ?? 0);
      const proporcao = totalNota > 0 ? Math.min(recebido / totalNota, 1) : 1;
      registrar(nota, proporcao, t.pagoEm ?? inicio);
    }
    if (semNota > 0) {
      avisos.push(`${semNota} recebimento(s) do mês sem nota vinculada ficaram fora da apuração — vincule o título à nota.`);
    }
    avisos.push("Regime de caixa também no PIS/COFINS (MP 2.158-35/2001, art. 20): só é permitido quando o IRPJ também é apurado por caixa.");
  } else {
    const notas = (await prisma.notaFiscal.findMany({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        status: "AUTORIZADA",
        modelo: { in: ["NFE", "NFCE", "NFSE"] },
        emitidaEm: { gte: inicio, lt: fim }
      },
      select: SELECT_NOTA,
      orderBy: { emitidaEm: "asc" }
    })) as unknown as NotaPis[];
    for (const nota of notas) registrar(nota, 1, nota.emitidaEm ?? nota.criadoEm);
  }

  const baseCalculo = round2(receitaBruta - exclusoes);
  const pisDebito = round2(baseCalculo * aliquotas.pis);
  const cofinsDebito = round2(baseCalculo * aliquotas.cofins);

  // Créditos: só existem no não cumulativo, e vêm dos impostos marcados como recuperáveis nas
  // entradas fiscais conferidas do mês.
  let pisCredito = 0;
  let cofinsCredito = 0;
  if (regimeApuracao === "NAO_CUMULATIVO") {
    const creditos = await prisma.entradaFiscalItemImposto.groupBy({
      by: ["tributo"],
      where: {
        ...scopedByTenantCompany(scope),
        recuperavel: true,
        tributo: { in: ["PIS", "COFINS"] },
        entradaFiscalItem: {
          entradaFiscal: {
            status: { notIn: ["CANCELADA", "ESTORNADA", "RASCUNHO"] },
            emitidaEm: { gte: inicio, lt: fim }
          }
        }
      },
      _sum: { valor: true }
    });
    for (const c of creditos) {
      const v = round2(Number(c._sum.valor ?? 0));
      if (c.tributo === "PIS") pisCredito = v;
      if (c.tributo === "COFINS") cofinsCredito = v;
    }
    avisos.push(
      "Créditos do não cumulativo estimados pelos impostos marcados como recuperáveis nas entradas do mês. " +
        "Créditos de energia, aluguéis, fretes, depreciação e serviços usados como insumo precisam ser conferidos pela contabilidade."
    );
  }

  const pisRecolher = round2(pisDebito - pisCredito - pisRetido);
  const cofinsRecolher = round2(cofinsDebito - cofinsCredito - cofinsRetido);

  if (exclusoes > 0) {
    avisos.push(
      `${exclusoes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de receita saiu da base ` +
        "(monofásico, alíquota zero, ST, isenção ou suspensão). Confira se a EFD-Contribuições está aproveitando a mesma segregação."
    );
  }
  if (pisRecolher < 0 || cofinsRecolher < 0) {
    avisos.push("Saldo negativo em PIS e/ou COFINS: é crédito a aproveitar no mês seguinte, não valor a pagar.");
  }
  avisos.push("Receitas fora de nota fiscal (financeiras, aluguel) e exclusões como ICMS na base precisam ser conferidas pela contabilidade.");

  return {
    empresa: { razaoSocial: empresa.razaoSocial, regime: empresa.regimeTributario },
    periodo: {
      ano,
      mes,
      rotulo: `${String(mes).padStart(2, "0")}/${ano}`,
      vencimento: vencimentoPisCofins(ano, mes).toISOString()
    },
    regimeApuracao,
    regimeReceita,
    aliquotas: { pis: aliquotas.pis, cofins: aliquotas.cofins, rotulo: aliquotas.rotulo, base: aliquotas.base },
    darf: DARF_PIS_COFINS[regimeApuracao],
    totais: {
      receitaBruta,
      exclusoes,
      baseCalculo,
      pisDebito,
      cofinsDebito,
      pisCredito,
      cofinsCredito,
      pisRetido,
      cofinsRetido,
      pisRecolher,
      cofinsRecolher,
      totalRecolher: round2(Math.max(pisRecolher, 0) + Math.max(cofinsRecolher, 0))
    },
    linhas,
    avisos
  };
}
