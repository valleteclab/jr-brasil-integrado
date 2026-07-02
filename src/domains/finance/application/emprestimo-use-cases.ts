import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * CONTRATOS DE EMPRÉSTIMO/FINANCIAMENTO — padrão contábil de mercado: cada parcela se decompõe em
 * AMORTIZAÇÃO (reduz o saldo devedor) + JUROS (despesa financeira). O cronograma é calculado pelo
 * sistema de amortização do contrato (PRICE, SAC, parcela informada do carnê ou sem juros) e as
 * parcelas AINDA NÃO PAGAS viram títulos no contas a pagar. Contratos antigos entram informando
 * quantas parcelas já foram quitadas — o saldo devedor atual é derivado do cronograma, nunca digitado.
 */

export class EmprestimoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmprestimoError";
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Soma meses mantendo o dia do vencimento (clampa no fim do mês: 31/01 + 1m → 28/02). */
function addMesesClamp(base: Date, meses: number): Date {
  const ano = base.getFullYear();
  const mes = base.getMonth() + meses;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return new Date(ano, mes, Math.min(base.getDate(), ultimoDia), 12, 0, 0);
}

export type SistemaAmortizacao = "PRICE" | "SAC" | "PARCELA_INFORMADA" | "SEM_JUROS";

export type ParcelaCronograma = {
  numero: number;
  vencimento: Date;
  valor: number;
  juros: number;
  amortizacao: number;
  saldoDevedorApos: number;
};

export type ParametrosCronograma = {
  valorPrincipal: number;
  /** % ao mês (ex.: 1.99). */
  taxaJurosMensal: number;
  sistemaAmortizacao: SistemaAmortizacao;
  totalParcelas: number;
  /** Obrigatório em PARCELA_INFORMADA (valor do carnê/contrato). */
  valorParcela?: number | null;
  primeiroVencimento: Date;
};

/**
 * Cronograma DETERMINÍSTICO do contrato (função pura — a simulação da tela e a geração dos títulos
 * usam exatamente o mesmo cálculo):
 *  - PRICE: parcelas iguais (pmt = P·i / (1 − (1+i)⁻ⁿ)); juros sobre o saldo, amortização crescente.
 *  - SAC: amortização constante (P/n); juros sobre o saldo → parcelas decrescentes.
 *  - PARCELA_INFORMADA: o valor da parcela vem do contrato/carnê; juros = saldo·i e a última parcela
 *    ajusta o resíduo (fica maior/menor que o carnê quando a taxa informada não fecha exato).
 *  - SEM_JUROS: divide o principal igualmente (resíduo na última).
 */
export function calcularCronograma(p: ParametrosCronograma): ParcelaCronograma[] {
  const P = round2(p.valorPrincipal);
  const n = Math.floor(p.totalParcelas);
  if (!(P > 0)) throw new EmprestimoError("Informe o valor do principal (valor liberado/financiado).");
  if (!(n >= 1 && n <= 600)) throw new EmprestimoError("Quantidade de parcelas deve ficar entre 1 e 600.");
  const i = Number(p.taxaJurosMensal) / 100;
  if (i < 0) throw new EmprestimoError("Taxa de juros não pode ser negativa.");
  if (Number.isNaN(p.primeiroVencimento.getTime())) throw new EmprestimoError("Primeiro vencimento inválido.");

  const parcelas: ParcelaCronograma[] = [];
  let saldo = P;
  const sistema: SistemaAmortizacao = i === 0 && p.sistemaAmortizacao !== "PARCELA_INFORMADA" ? "SEM_JUROS" : p.sistemaAmortizacao;

  if (sistema === "PRICE") {
    const pmt = round2((P * i) / (1 - Math.pow(1 + i, -n)));
    for (let k = 1; k <= n; k++) {
      const juros = round2(saldo * i);
      const amortizacao = k === n ? saldo : round2(pmt - juros);
      const valor = k === n ? round2(saldo + juros) : pmt;
      saldo = round2(saldo - amortizacao);
      parcelas.push({ numero: k, vencimento: addMesesClamp(p.primeiroVencimento, k - 1), valor, juros, amortizacao, saldoDevedorApos: saldo });
    }
  } else if (sistema === "SAC") {
    const amortBase = round2(P / n);
    for (let k = 1; k <= n; k++) {
      const juros = round2(saldo * i);
      const amortizacao = k === n ? saldo : amortBase;
      const valor = round2(amortizacao + juros);
      saldo = round2(saldo - amortizacao);
      parcelas.push({ numero: k, vencimento: addMesesClamp(p.primeiroVencimento, k - 1), valor, juros, amortizacao, saldoDevedorApos: saldo });
    }
  } else if (sistema === "PARCELA_INFORMADA") {
    const pmt = round2(Number(p.valorParcela ?? 0));
    if (!(pmt > 0)) throw new EmprestimoError("Informe o valor da parcela do contrato/carnê.");
    if (i > 0 && round2(P * i) >= pmt) {
      throw new EmprestimoError("O valor da parcela não cobre nem os juros do 1º mês — confira a taxa e o valor informados.");
    }
    if (i === 0) {
      // Sem taxa informada: amortização linear e a diferença da parcela é o custo (juros) embutido.
      const amortBase = round2(P / n);
      for (let k = 1; k <= n; k++) {
        const amortizacao = k === n ? saldo : amortBase;
        const juros = round2(pmt - amortizacao);
        const valor = pmt;
        saldo = round2(saldo - amortizacao);
        parcelas.push({ numero: k, vencimento: addMesesClamp(p.primeiroVencimento, k - 1), valor, juros: Math.max(juros, 0), amortizacao, saldoDevedorApos: saldo });
      }
    } else {
      for (let k = 1; k <= n; k++) {
        const juros = round2(saldo * i);
        const amortizacao = k === n ? saldo : round2(Math.min(pmt - juros, saldo));
        const valor = k === n ? round2(saldo + juros) : pmt;
        saldo = round2(saldo - amortizacao);
        parcelas.push({ numero: k, vencimento: addMesesClamp(p.primeiroVencimento, k - 1), valor, juros, amortizacao, saldoDevedorApos: saldo });
      }
    }
  } else {
    // SEM_JUROS: divisão igual, resíduo na última.
    const base = Math.floor((P / n) * 100) / 100;
    for (let k = 1; k <= n; k++) {
      const amortizacao = k === n ? saldo : base;
      saldo = round2(saldo - amortizacao);
      parcelas.push({ numero: k, vencimento: addMesesClamp(p.primeiroVencimento, k - 1), valor: amortizacao, juros: 0, amortizacao, saldoDevedorApos: saldo });
    }
  }
  return parcelas;
}

export type CreateEmprestimoInput = {
  tipo?: string | null;
  instituicao: string;
  fornecedorId?: string | null;
  numeroContrato?: string | null;
  dataContratacao: Date;
  valorPrincipal: number;
  taxaJurosMensal?: number | null;
  sistemaAmortizacao: SistemaAmortizacao;
  totalParcelas: number;
  parcelasJaPagas?: number | null;
  valorParcela?: number | null;
  primeiroVencimento: Date;
  contaBancariaId?: string | null;
  classificacaoId?: string | null;
  observacoes?: string | null;
};

/** Cria o contrato e materializa as parcelas EM ABERTO no contas a pagar (as já pagas ficam só no cronograma). */
export async function createEmprestimo(scope: TenantScope, input: CreateEmprestimoInput, usuarioId?: string) {
  if (!input.instituicao?.trim()) throw new EmprestimoError("Informe a instituição/credor do empréstimo.");
  const jaPagas = Math.max(0, Math.floor(input.parcelasJaPagas ?? 0));
  if (jaPagas >= input.totalParcelas) {
    throw new EmprestimoError("Parcelas já pagas deve ser MENOR que o total (contrato quitado não precisa ser cadastrado).");
  }
  if (Number.isNaN(input.dataContratacao.getTime())) throw new EmprestimoError("Data de contratação inválida.");

  const cronograma = calcularCronograma({
    valorPrincipal: input.valorPrincipal,
    taxaJurosMensal: Number(input.taxaJurosMensal ?? 0),
    sistemaAmortizacao: input.sistemaAmortizacao,
    totalParcelas: input.totalParcelas,
    valorParcela: input.valorParcela,
    primeiroVencimento: input.primeiroVencimento
  });

  const rotuloTipo = (input.tipo ?? "EMPRESTIMO").replace(/_/g, " ").toLowerCase();
  const contrato = input.numeroContrato?.trim() ? ` (contrato ${input.numeroContrato.trim()})` : "";

  return prisma.$transaction(async (tx) => {
    const emprestimo = await tx.emprestimo.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ambiente: scope.ambiente ?? "HOMOLOGACAO",
        tipo: (input.tipo ?? "EMPRESTIMO").toUpperCase(),
        instituicao: input.instituicao.trim(),
        fornecedorId: input.fornecedorId ?? null,
        numeroContrato: input.numeroContrato?.trim() || null,
        dataContratacao: input.dataContratacao,
        valorPrincipal: round2(input.valorPrincipal),
        taxaJurosMensal: Number(input.taxaJurosMensal ?? 0),
        sistemaAmortizacao: input.sistemaAmortizacao,
        totalParcelas: Math.floor(input.totalParcelas),
        parcelasJaPagas: jaPagas,
        valorParcela: input.valorParcela != null ? round2(Number(input.valorParcela)) : null,
        primeiroVencimento: input.primeiroVencimento,
        contaBancariaId: input.contaBancariaId ?? null,
        classificacaoId: input.classificacaoId ?? null,
        observacoes: input.observacoes?.trim() || null
      }
    });

    for (const parcela of cronograma.slice(jaPagas)) {
      await tx.contaPagar.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          ambiente: scope.ambiente ?? "HOMOLOGACAO",
          fornecedorId: input.fornecedorId ?? null,
          descricao: `${rotuloTipo.charAt(0).toUpperCase()}${rotuloTipo.slice(1)} ${input.instituicao.trim()}${contrato} — parcela ${parcela.numero}/${cronograma.length}`,
          numeroDocumento: input.numeroContrato?.trim() || null,
          origem: "EMPRESTIMO",
          vencimento: parcela.vencimento,
          valor: parcela.valor,
          observacoes: `Juros R$ ${parcela.juros.toFixed(2)} + amortização R$ ${parcela.amortizacao.toFixed(2)} · saldo devedor após: R$ ${parcela.saldoDevedorApos.toFixed(2)}`,
          contaBancariaId: input.contaBancariaId ?? null,
          classificacaoId: input.classificacaoId ?? null,
          emprestimoId: emprestimo.id,
          emprestimoParcela: parcela.numero,
          status: "ABERTO"
        }
      });
    }

    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "Emprestimo",
      entidadeId: emprestimo.id,
      acao: "CREATE",
      payload: {
        instituicao: emprestimo.instituicao,
        valorPrincipal: Number(emprestimo.valorPrincipal),
        totalParcelas: emprestimo.totalParcelas,
        parcelasJaPagas: jaPagas,
        sistema: emprestimo.sistemaAmortizacao
      }
    });

    return emprestimo;
  }, { timeout: 60000 });
}

export type EmprestimoResumo = {
  id: string;
  tipo: string;
  instituicao: string;
  numeroContrato: string | null;
  dataContratacao: string;
  valorPrincipal: number;
  taxaJurosMensal: number;
  sistemaAmortizacao: string;
  totalParcelas: number;
  parcelasPagas: number;
  parcelasAbertas: number;
  parcelasVencidas: number;
  saldoDevedor: number;
  totalJurosContrato: number;
  totalPagar: number;
  proximaParcela: { numero: number; vencimento: string; valor: number } | null;
  status: string;
};

/** Lista os contratos com os agregados derivados (saldo devedor, progresso, próxima parcela). */
export async function listEmprestimos(scope: TenantScope): Promise<EmprestimoResumo[]> {
  const contratos = await prisma.emprestimo.findMany({
    where: scopedByTenantCompany(scope),
    orderBy: { criadoEm: "desc" },
    include: {
      parcelas: { select: { emprestimoParcela: true, status: true, vencimento: true, valor: true } }
    }
  });
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return contratos.map((c) => {
    const cronograma = calcularCronograma({
      valorPrincipal: Number(c.valorPrincipal),
      taxaJurosMensal: Number(c.taxaJurosMensal),
      sistemaAmortizacao: c.sistemaAmortizacao as SistemaAmortizacao,
      totalParcelas: c.totalParcelas,
      valorParcela: c.valorParcela != null ? Number(c.valorParcela) : null,
      primeiroVencimento: c.primeiroVencimento
    });
    const pagasNoErp = c.parcelas.filter((p) => p.status === "PAGO").length;
    const parcelasPagas = c.parcelasJaPagas + pagasNoErp;
    const abertas = c.parcelas.filter((p) => ["ABERTO", "PARCIAL", "VENCIDO"].includes(p.status));
    const vencidas = abertas.filter((p) => p.vencimento < hoje).length;
    // Saldo devedor = saldo após a última parcela paga (ordem do cronograma).
    const saldoDevedor = parcelasPagas > 0 ? cronograma[Math.min(parcelasPagas, cronograma.length) - 1].saldoDevedorApos : Number(c.valorPrincipal);
    const proxima = abertas.sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())[0] ?? null;
    const quitado = parcelasPagas >= c.totalParcelas || (c.status === "ATIVO" && !abertas.length && parcelasPagas > 0);
    return {
      id: c.id,
      tipo: c.tipo,
      instituicao: c.instituicao,
      numeroContrato: c.numeroContrato,
      dataContratacao: c.dataContratacao.toISOString(),
      valorPrincipal: Number(c.valorPrincipal),
      taxaJurosMensal: Number(c.taxaJurosMensal),
      sistemaAmortizacao: c.sistemaAmortizacao,
      totalParcelas: c.totalParcelas,
      parcelasPagas,
      parcelasAbertas: abertas.length,
      parcelasVencidas: vencidas,
      saldoDevedor,
      totalJurosContrato: round2(cronograma.reduce((s, p) => s + p.juros, 0)),
      totalPagar: round2(cronograma.reduce((s, p) => s + p.valor, 0)),
      proximaParcela: proxima
        ? { numero: proxima.emprestimoParcela ?? 0, vencimento: proxima.vencimento.toISOString(), valor: Number(proxima.valor) }
        : null,
      status: c.status === "CANCELADO" ? "CANCELADO" : quitado ? "QUITADO" : "ATIVO"
    };
  });
}

export type EmprestimoDetalhe = EmprestimoResumo & {
  observacoes: string | null;
  contaBancariaNome: string | null;
  classificacaoNome: string | null;
  cronograma: Array<ParcelaCronograma & { situacao: string; pagoEm: string | null; contaPagarId: string | null }>;
};

/** Detalhe do contrato: cronograma completo com a situação real de cada parcela. */
export async function getEmprestimoDetalhe(scope: TenantScope, id: string): Promise<EmprestimoDetalhe> {
  const lista = await listEmprestimos(scope);
  const resumo = lista.find((e) => e.id === id);
  if (!resumo) throw new EmprestimoError("Empréstimo não encontrado.");
  const c = await prisma.emprestimo.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: {
      contaBancaria: { select: { nome: true } },
      classificacao: { select: { nome: true } },
      parcelas: { select: { id: true, emprestimoParcela: true, status: true, pagoEm: true } }
    }
  });
  if (!c) throw new EmprestimoError("Empréstimo não encontrado.");
  const cronograma = calcularCronograma({
    valorPrincipal: Number(c.valorPrincipal),
    taxaJurosMensal: Number(c.taxaJurosMensal),
    sistemaAmortizacao: c.sistemaAmortizacao as SistemaAmortizacao,
    totalParcelas: c.totalParcelas,
    valorParcela: c.valorParcela != null ? Number(c.valorParcela) : null,
    primeiroVencimento: c.primeiroVencimento
  });
  return {
    ...resumo,
    observacoes: c.observacoes,
    contaBancariaNome: c.contaBancaria?.nome ?? null,
    classificacaoNome: c.classificacao?.nome ?? null,
    cronograma: cronograma.map((p) => {
      if (p.numero <= c.parcelasJaPagas) {
        return { ...p, situacao: "PAGA (antes do cadastro)", pagoEm: null, contaPagarId: null };
      }
      const titulo = c.parcelas.find((t) => t.emprestimoParcela === p.numero) ?? null;
      const situacao = titulo
        ? titulo.status === "PAGO" ? "PAGA" : titulo.status === "CANCELADO" ? "CANCELADA" : "EM ABERTO"
        : "SEM TÍTULO";
      return { ...p, situacao, pagoEm: titulo?.pagoEm?.toISOString() ?? null, contaPagarId: titulo?.id ?? null };
    })
  };
}

/** Cancela o contrato: parcelas em aberto viram CANCELADO no contas a pagar (as pagas ficam). */
export async function cancelarEmprestimo(scope: TenantScope, id: string, usuarioId?: string) {
  const c = await prisma.emprestimo.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!c) throw new EmprestimoError("Empréstimo não encontrado.");
  if (c.status === "CANCELADO") return c;
  return prisma.$transaction(async (tx) => {
    await tx.contaPagar.updateMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, emprestimoId: id, status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } },
      data: { status: "CANCELADO" }
    });
    const atualizado = await tx.emprestimo.update({ where: { id }, data: { status: "CANCELADO" } });
    await createAuditLog(tx, { scope, usuarioId, entidade: "Emprestimo", entidadeId: id, acao: "CANCEL", payload: { instituicao: c.instituicao } });
    return atualizado;
  });
}
