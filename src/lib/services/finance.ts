import { getDevelopmentTenantScope, scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type StatusTone = "success" | "warn" | "danger" | "info" | "mute";

export type PayableSummary = {
  id: string;
  descricao: string;
  parte: string;
  numeroDocumento: string;
  vencimento: string;
  vencimentoRaw: string;
  valor: string;
  valorPago: string;
  saldo: string;
  saldoNumber: number;
  statusLabel: string;
  statusTone: StatusTone;
  formaPagamento: string;
  classificacaoId: string | null;
  classificacaoNome: string | null;
  /** Resumo de "como foi pago" (forma + parcelas + cartão/bandeira + conta), quando quitada. */
  comoPago?: string | null;
  canSettle: boolean;
  /** Pode ser excluída (admin): sem pagamento registrado. */
  canDelete: boolean;
  /** Tem baixa estornável: valorPago > 0 e status PAGO/PARCIAL. Opcional para não quebrar objetos otimistas. */
  canEstornar?: boolean;
};

export type ReceivableSummary = {
  id: string;
  descricao: string;
  parte: string;
  numeroDocumento: string;
  vencimento: string;
  vencimentoRaw: string;
  valor: string;
  valorPago: string;
  saldo: string;
  saldoNumber: number;
  statusLabel: string;
  statusTone: StatusTone;
  formaPagamento: string;
  classificacaoId: string | null;
  classificacaoNome: string | null;
  /** Boleto Sicoob deste título (null = sem boleto). */
  boletoStatus?: string | null;
  boletoLinhaDigitavel?: string | null;
  canSettle: boolean;
  /** Pode ser excluída (admin): sem recebimento, sem antecipação e sem boleto ativo no banco. */
  canDelete?: boolean;
  /** Tem baixa estornável: valorPago > 0 e status PAGO/PARCIAL. Opcional para não quebrar objetos otimistas. */
  canEstornar?: boolean;
};

export type BankAccountSummary = {
  id: string;
  nome: string;
  banco: string;
  saldoAtual: string;
  saldoAtualNumber: number;
};

export type ClienteOption = {
  id: string;
  nome: string;
};

export type FinanceSummary = {
  totalAPagar: string;
  totalAReceber: string;
  vencidosAPagar: string;
  vencidosAReceber: string;
  saldoContas: string;
  totalAPagarNumber: number;
  totalAReceberNumber: number;
  vencidosAPagarNumber: number;
  vencidosAReceberNumber: number;
  saldoContasNumber: number;
};

export type CashFlowDay = {
  data: string;
  entradas: number;
  saidas: number;
  saldoDia: number;
  saldoAcumulado: number;
};

export type CashFlowPeriod = {
  label: string;
  dias: number;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
};

export type CashFlowData = {
  projetado30: CashFlowPeriod;
  projetado60: CashFlowPeriod;
  projetado90: CashFlowPeriod;
  realizado30: { totalCreditos: number; totalDebitos: number; saldo: number };
  dias: CashFlowDay[];
  saldoAtualContas: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

function fmtDate(d: Date): string {
  return DATE_FMT.format(new Date(d));
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

type RawStatus = "ABERTO" | "PARCIAL" | "VENCIDO" | "PAGO" | "CANCELADO";

function resolveStatus(
  dbStatus: RawStatus,
  vencimento: Date,
  hoje: Date
): { statusLabel: string; statusTone: StatusTone; canSettle: boolean } {
  if (dbStatus === "PAGO") return { statusLabel: "Pago", statusTone: "success", canSettle: false };
  if (dbStatus === "CANCELADO") return { statusLabel: "Cancelado", statusTone: "mute", canSettle: false };

  const isVencido = vencimento < hoje;
  if (isVencido) return { statusLabel: "Vencido", statusTone: "danger", canSettle: true };
  if (dbStatus === "PARCIAL") return { statusLabel: "Parcial", statusTone: "warn", canSettle: true };
  return { statusLabel: "Aberto", statusTone: "info", canSettle: true };
}

// ─── Listagem de Contas a Pagar ───────────────────────────────────────────────

export async function listPayables(filtroStatus?: string): Promise<PayableSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para listar contas a pagar.");
  }

  const scope = await getDevelopmentTenantScope();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const whereStatus = filtroStatus && filtroStatus !== "TODOS"
    ? { status: filtroStatus as RawStatus }
    : { status: { in: ["ABERTO", "PARCIAL", "VENCIDO", "PAGO", "CANCELADO"] as RawStatus[] } };

  const contas = await prisma.contaPagar.findMany({
    where: { ...scopedByTenantCompanyAmbiente(scope), ...whereStatus },
    include: {
      fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
      classificacao: { select: { id: true, nome: true } }
    },
    orderBy: [{ vencimento: "asc" }, { criadoEm: "desc" }]
  });

  // "Como foi pago": pega o movimento financeiro (DEBITO) mais recente de cada conta quitada e
  // monta um resumo (forma + parcelas + cartão/bandeira + conta). Tudo em 2 queries (sem N+1).
  const idsComPagamento = contas.filter((c) => Number(c.valorPago) > 0).map((c) => c.id);
  const movPorConta = new Map<string, { formaPagamento: string | null; parcelas: number | null; bandeira: string | null; maquinaCartaoId: string | null; contaNome: string | null; data: Date }>();
  if (idsComPagamento.length) {
    const movs = await prisma.movimentoFinanceiro.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), origem: "CONTA_PAGAR", contaPagarId: { in: idsComPagamento } },
      select: { contaPagarId: true, formaPagamento: true, parcelas: true, bandeira: true, maquinaCartaoId: true, dataMovimento: true, contaBancaria: { select: { nome: true } } },
      orderBy: { dataMovimento: "desc" }
    });
    const maqIds = [...new Set(movs.map((m) => m.maquinaCartaoId).filter(Boolean) as string[])];
    const maqNome = new Map<string, string>();
    if (maqIds.length) {
      const maqs = await prisma.maquinaCartao.findMany({ where: { id: { in: maqIds } }, select: { id: true, nome: true } });
      for (const m of maqs) maqNome.set(m.id, m.nome);
    }
    for (const m of movs) {
      if (!m.contaPagarId || movPorConta.has(m.contaPagarId)) continue; // já é o mais recente (ordenado desc)
      movPorConta.set(m.contaPagarId, {
        formaPagamento: m.formaPagamento,
        parcelas: m.parcelas,
        bandeira: m.bandeira,
        maquinaCartaoId: m.maquinaCartaoId ? (maqNome.get(m.maquinaCartaoId) ?? null) : null,
        contaNome: m.contaBancaria?.nome ?? null,
        data: m.dataMovimento
      });
    }
  }

  return contas.map((c) => {
    const valor = Number(c.valor);
    const valorPago = Number(c.valorPago);
    const juros = Number(c.juros);
    const multa = Number(c.multa);
    const desconto = Number(c.descontoBaixa);
    const saldo = round2(valor + juros + multa - desconto - valorPago);
    const { statusLabel, statusTone, canSettle } = resolveStatus(
      c.status as RawStatus,
      c.vencimento,
      hoje
    );

    return {
      id: c.id,
      descricao: c.descricao,
      parte: c.fornecedor
        ? (c.fornecedor.nomeFantasia ?? c.fornecedor.razaoSocial)
        : "—",
      numeroDocumento: c.numeroDocumento ?? "—",
      vencimento: fmtDate(c.vencimento),
      vencimentoRaw: c.vencimento.toISOString(),
      valor: formatBrl(valor),
      valorPago: formatBrl(valorPago),
      saldo: formatBrl(saldo),
      saldoNumber: saldo,
      statusLabel,
      statusTone,
      formaPagamento: c.formaPagamento ?? "—",
      classificacaoId: c.classificacao?.id ?? null,
      classificacaoNome: c.classificacao?.nome ?? null,
      comoPago: (() => {
        const m = movPorConta.get(c.id);
        if (!m) return null;
        const partes = [
          m.formaPagamento,
          m.parcelas && m.parcelas > 1 ? `${m.parcelas}x` : null,
          m.maquinaCartaoId,
          m.bandeira,
          m.contaNome ? `via ${m.contaNome}` : null,
          fmtDate(m.data)
        ].filter(Boolean);
        return partes.length ? partes.join(" · ") : null;
      })(),
      canSettle,
      // Excluir (admin): só sem pagamento registrado (evita orfanar movimentos financeiros).
      canDelete: valorPago === 0,
      // Estornar baixa: há pagamento registrado e a conta está quitada/parcial.
      canEstornar: valorPago > 0 && (c.status === "PAGO" || c.status === "PARCIAL")
    };
  });
}

// ─── Listagem de Contas a Receber ─────────────────────────────────────────────

export async function listReceivables(filtroStatus?: string): Promise<ReceivableSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para listar contas a receber.");
  }

  const scope = await getDevelopmentTenantScope();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const whereStatus = filtroStatus && filtroStatus !== "TODOS"
    ? { status: filtroStatus as RawStatus }
    : { status: { in: ["ABERTO", "PARCIAL", "VENCIDO", "PAGO", "CANCELADO"] as RawStatus[] } };

  const contas = await prisma.contaReceber.findMany({
    where: { ...scopedByTenantCompanyAmbiente(scope), ...whereStatus },
    include: {
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
      classificacao: { select: { id: true, nome: true } },
      boleto: { select: { status: true, linhaDigitavel: true } }
    },
    orderBy: [{ vencimento: "asc" }, { criadoEm: "desc" }]
  });

  return contas.map((c) => {
    const valor = Number(c.valor);
    const valorPago = Number(c.valorPago);
    const juros = Number(c.juros);
    const multa = Number(c.multa);
    const desconto = Number(c.descontoBaixa);
    const saldo = round2(valor + juros + multa - desconto - valorPago);
    const { statusLabel, statusTone, canSettle } = resolveStatus(
      c.status as RawStatus,
      c.vencimento,
      hoje
    );

    return {
      id: c.id,
      descricao: c.descricao,
      parte: c.cliente.nomeFantasia ?? c.cliente.razaoSocial,
      numeroDocumento: c.numeroDocumento ?? "—",
      vencimento: fmtDate(c.vencimento),
      vencimentoRaw: c.vencimento.toISOString(),
      valor: formatBrl(valor),
      valorPago: formatBrl(valorPago),
      saldo: formatBrl(saldo),
      saldoNumber: saldo,
      statusLabel,
      statusTone,
      formaPagamento: c.formaPagamento ?? "—",
      classificacaoId: c.classificacao?.id ?? null,
      classificacaoNome: c.classificacao?.nome ?? null,
      boletoStatus: c.boleto?.status ?? null,
      boletoLinhaDigitavel: c.boleto?.linhaDigitavel ?? null,
      canSettle,
      // Excluir (admin): sem recebimento, sem antecipação e sem boleto ATIVO no banco
      // (EMITIDO/REGISTRADO/LIQUIDADO exigem cancelar/estornar antes).
      canDelete: valorPago === 0 && !c.antecipacaoId && (!c.boleto || ["BAIXADO", "ERRO"].includes(c.boleto.status)),
      // Estornar baixa: há recebimento registrado e a conta está quitada/parcial.
      canEstornar: valorPago > 0 && (c.status === "PAGO" || c.status === "PARCIAL")
    };
  });
}

// ─── Listagem de Contas Bancárias ─────────────────────────────────────────────

export async function listBankAccounts(): Promise<BankAccountSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para listar contas bancárias.");
  }

  const scope = await getDevelopmentTenantScope();
  const contas = await prisma.contaBancaria.findMany({
    where: { ...scopedByTenantCompany(scope), ativo: true },
    orderBy: { nome: "asc" }
  });

  return contas.map((c) => ({
    id: c.id,
    nome: c.nome,
    banco: c.banco ?? "—",
    saldoAtual: formatBrl(Number(c.saldoAtual)),
    saldoAtualNumber: Number(c.saldoAtual)
  }));
}

// ─── Maquininhas/cartões (seletor de "como foi pago" no cartão) ───────────────

export type MaquinaCartaoOption = { id: string; nome: string; adquirente: string | null };

export async function listMaquinasCartaoOptions(): Promise<MaquinaCartaoOption[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para listar máquinas de cartão.");
  }

  const scope = await getDevelopmentTenantScope();
  const maquinas = await prisma.maquinaCartao.findMany({
    where: { ...scopedByTenantCompany(scope), ativo: true },
    select: { id: true, nome: true, adquirente: true },
    orderBy: { nome: "asc" }
  });
  return maquinas.map((m) => ({ id: m.id, nome: m.nome, adquirente: m.adquirente }));
}

// ─── Clientes ativos (seletor de conta a receber avulsa) ──────────────────────

export async function listActiveClienteOptions(): Promise<ClienteOption[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para listar clientes.");
  }

  const scope = await getDevelopmentTenantScope();
  const clientes = await prisma.cliente.findMany({
    where: { ...scopedByTenantCompany(scope), status: "ATIVO" },
    select: { id: true, razaoSocial: true, nomeFantasia: true },
    orderBy: { razaoSocial: "asc" }
  });

  return clientes.map((c) => ({
    id: c.id,
    nome: c.nomeFantasia ?? c.razaoSocial
  }));
}

// ─── KPIs Financeiros ─────────────────────────────────────────────────────────

export async function getFinanceSummary(): Promise<FinanceSummary> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para carregar resumo financeiro.");
  }

  const scope = await getDevelopmentTenantScope();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [pagar, receber, bancos] = await Promise.all([
    prisma.contaPagar.findMany({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        status: { in: ["ABERTO", "PARCIAL"] }
      },
      select: { valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true, vencimento: true }
    }),
    prisma.contaReceber.findMany({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        status: { in: ["ABERTO", "PARCIAL"] }
      },
      select: { valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true, vencimento: true }
    }),
    prisma.contaBancaria.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      select: { saldoAtual: true }
    })
  ]);

  let totalAPagar = 0;
  let vencidosAPagar = 0;
  for (const c of pagar) {
    const saldo = round2(
      Number(c.valor) + Number(c.juros) + Number(c.multa) - Number(c.descontoBaixa) - Number(c.valorPago)
    );
    totalAPagar += saldo;
    if (c.vencimento < hoje) vencidosAPagar += saldo;
  }

  let totalAReceber = 0;
  let vencidosAReceber = 0;
  for (const c of receber) {
    const saldo = round2(
      Number(c.valor) + Number(c.juros) + Number(c.multa) - Number(c.descontoBaixa) - Number(c.valorPago)
    );
    totalAReceber += saldo;
    if (c.vencimento < hoje) vencidosAReceber += saldo;
  }

  const saldoContas = bancos.reduce((acc, b) => acc + Number(b.saldoAtual), 0);

  return {
    totalAPagar: formatBrl(totalAPagar),
    totalAReceber: formatBrl(totalAReceber),
    vencidosAPagar: formatBrl(vencidosAPagar),
    vencidosAReceber: formatBrl(vencidosAReceber),
    saldoContas: formatBrl(saldoContas),
    totalAPagarNumber: round2(totalAPagar),
    totalAReceberNumber: round2(totalAReceber),
    vencidosAPagarNumber: round2(vencidosAPagar),
    vencidosAReceberNumber: round2(vencidosAReceber),
    saldoContasNumber: round2(saldoContas)
  };
}

// ─── Fluxo de Caixa ───────────────────────────────────────────────────────────

export async function getCashFlow(): Promise<CashFlowData> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada para carregar fluxo de caixa.");
  }

  const scope = await getDevelopmentTenantScope();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const fim90 = new Date(hoje);
  fim90.setDate(fim90.getDate() + 90);

  const inicio30Atras = new Date(hoje);
  inicio30Atras.setDate(inicio30Atras.getDate() - 30);

  const [pagarProjetado, receberProjetado, movimentosRealizados, bancos] = await Promise.all([
    prisma.contaPagar.findMany({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        status: { in: ["ABERTO", "PARCIAL"] },
        vencimento: { gte: hoje, lte: fim90 }
      },
      select: { vencimento: true, valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true }
    }),
    prisma.contaReceber.findMany({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        status: { in: ["ABERTO", "PARCIAL"] },
        vencimento: { gte: hoje, lte: fim90 }
      },
      select: { vencimento: true, valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true }
    }),
    prisma.movimentoFinanceiro.findMany({
      where: {
        ...scopedByTenantCompanyAmbiente(scope),
        dataMovimento: { gte: inicio30Atras, lt: hoje }
      },
      select: { tipo: true, valor: true }
    }),
    prisma.contaBancaria.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      select: { saldoAtual: true }
    })
  ]);

  const saldoAtualContas = bancos.reduce((acc, b) => acc + Number(b.saldoAtual), 0);

  // Realizado últimos 30 dias
  let totalCreditos = 0;
  let totalDebitos = 0;
  for (const m of movimentosRealizados) {
    if (m.tipo === "CREDITO") totalCreditos += Number(m.valor);
    else totalDebitos += Number(m.valor);
  }

  // Agrupa projetado por dia
  const mapDias = new Map<string, { entradas: number; saidas: number }>();

  for (const c of receberProjetado) {
    const saldo = round2(
      Number(c.valor) + Number(c.juros) + Number(c.multa) - Number(c.descontoBaixa) - Number(c.valorPago)
    );
    const key = c.vencimento.toISOString().substring(0, 10);
    const d = mapDias.get(key) ?? { entradas: 0, saidas: 0 };
    d.entradas += saldo;
    mapDias.set(key, d);
  }

  for (const c of pagarProjetado) {
    const saldo = round2(
      Number(c.valor) + Number(c.juros) + Number(c.multa) - Number(c.descontoBaixa) - Number(c.valorPago)
    );
    const key = c.vencimento.toISOString().substring(0, 10);
    const d = mapDias.get(key) ?? { entradas: 0, saidas: 0 };
    d.saidas += saldo;
    mapDias.set(key, d);
  }

  // Gera array de dias ordenado
  const keysOrdenadas = Array.from(mapDias.keys()).sort();
  let saldoAcumulado = saldoAtualContas;
  const dias: CashFlowDay[] = keysOrdenadas.map((key) => {
    const d = mapDias.get(key)!;
    const saldoDia = round2(d.entradas - d.saidas);
    saldoAcumulado = round2(saldoAcumulado + saldoDia);
    return {
      data: DATE_FMT.format(new Date(key + "T12:00:00")),
      entradas: round2(d.entradas),
      saidas: round2(d.saidas),
      saldoDia,
      saldoAcumulado
    };
  });

  // Períodos resumidos
  function calcPeriod(label: string, limiteDias: number): CashFlowPeriod {
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + limiteDias);

    let ent = 0;
    let sai = 0;
    for (const c of receberProjetado) {
      if (c.vencimento <= limite) {
        ent += round2(
          Number(c.valor) + Number(c.juros) + Number(c.multa) - Number(c.descontoBaixa) - Number(c.valorPago)
        );
      }
    }
    for (const c of pagarProjetado) {
      if (c.vencimento <= limite) {
        sai += round2(
          Number(c.valor) + Number(c.juros) + Number(c.multa) - Number(c.descontoBaixa) - Number(c.valorPago)
        );
      }
    }
    return { label, dias: limiteDias, totalEntradas: round2(ent), totalSaidas: round2(sai), saldo: round2(ent - sai) };
  }

  return {
    projetado30: calcPeriod("30 dias", 30),
    projetado60: calcPeriod("60 dias", 60),
    projetado90: calcPeriod("90 dias", 90),
    realizado30: {
      totalCreditos: round2(totalCreditos),
      totalDebitos: round2(totalDebitos),
      saldo: round2(totalCreditos - totalDebitos)
    },
    dias,
    saldoAtualContas: round2(saldoAtualContas)
  };
}
