import type { Prisma, StatusFinanceiro } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";

const STATUS: StatusFinanceiro[] = ["ABERTO", "PARCIAL", "PAGO", "VENCIDO", "CANCELADO"];

export async function listPayablesForAgent(
  scope: TenantScope,
  input: { fornecedor?: string; status?: string; vencimentoDias?: number; limite?: number }
) {
  const fornecedor = input.fornecedor?.trim();
  const documento = fornecedor?.replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  const status = STATUS.includes(input.status as StatusFinanceiro) ? (input.status as StatusFinanceiro) : undefined;
  const vencimentoDias = Number(input.vencimentoDias);
  const limite = Math.min(Math.max(Number(input.limite) || 20, 1), 50);
  const vencimentoAte = Number.isFinite(vencimentoDias) && vencimentoDias >= 0
    ? new Date(Date.now() + Math.min(vencimentoDias, 3650) * 86_400_000)
    : undefined;
  const where: Prisma.ContaPagarWhereInput = {
    ...scopedByTenantCompanyAmbiente(scope),
    ...(status ? { status } : { status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } }),
    ...(vencimentoAte ? { vencimento: { lte: vencimentoAte } } : {}),
    ...(fornecedor
      ? {
          fornecedor: {
            OR: [
              { razaoSocial: { contains: fornecedor, mode: "insensitive" } },
              { nomeFantasia: { contains: fornecedor, mode: "insensitive" } },
              ...(documento ? [{ documento: { contains: documento } }] : [])
            ]
          }
        }
      : {})
  };

  const [totalEncontrado, contas] = await prisma.$transaction([
    prisma.contaPagar.count({ where }),
    prisma.contaPagar.findMany({
      where,
      orderBy: [{ vencimento: "asc" }, { criadoEm: "desc" }],
      take: limite,
      select: {
        id: true,
        descricao: true,
        numeroDocumento: true,
        vencimento: true,
        valor: true,
        valorPago: true,
        juros: true,
        multa: true,
        descontoBaixa: true,
        status: true,
        formaPagamento: true,
        fornecedor: { select: { razaoSocial: true, nomeFantasia: true } },
        pedidoCompra: { select: { numero: true } }
      }
    })
  ]);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return {
    totalEncontrado,
    exibidos: contas.length,
    contas: contas.map((conta) => ({
      contaPagarId: conta.id,
      fornecedor: conta.fornecedor ? (conta.fornecedor.nomeFantasia ?? conta.fornecedor.razaoSocial) : null,
      descricao: conta.descricao,
      numeroDocumento: conta.numeroDocumento,
      pedidoCompra: conta.pedidoCompra?.numero ?? null,
      vencimento: conta.vencimento.toISOString().slice(0, 10),
      valor: Number(conta.valor),
      valorPago: Number(conta.valorPago),
      saldo: Math.round((Number(conta.valor) + Number(conta.juros) + Number(conta.multa) - Number(conta.descontoBaixa) - Number(conta.valorPago)) * 100) / 100,
      status: conta.status,
      vencida: conta.vencimento < hoje && !["PAGO", "CANCELADO"].includes(conta.status),
      formaPagamento: conta.formaPagamento
    }))
  };
}

export async function getCashFlowForAgent(scope: TenantScope, input: { periodoDias?: number }) {
  const dias = Math.min(Math.max(Number(input.periodoDias) || 30, 1), 365);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(hoje.getTime() + dias * 86_400_000);
  const inicioRealizado = new Date(hoje.getTime() - dias * 86_400_000);
  const [pagar, receber, movimentos, bancos] = await Promise.all([
    prisma.contaPagar.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] }, vencimento: { lte: fim } },
      select: { vencimento: true, valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true }
    }),
    prisma.contaReceber.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] }, vencimento: { lte: fim } },
      select: { vencimento: true, valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true }
    }),
    prisma.movimentoFinanceiro.findMany({
      where: { ...scopedByTenantCompanyAmbiente(scope), dataMovimento: { gte: inicioRealizado, lt: hoje } },
      select: { tipo: true, valor: true }
    }),
    prisma.contaBancaria.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true },
      select: { saldoAtual: true }
    })
  ]);
  const saldo = (c: { valor: unknown; juros: unknown; multa: unknown; descontoBaixa: unknown; valorPago: unknown }) =>
    Number(c.valor) + Number(c.juros) + Number(c.multa) - Number(c.descontoBaixa) - Number(c.valorPago);
  const entradasProjetadas = receber.reduce((s, c) => s + saldo(c), 0);
  const saidasProjetadas = pagar.reduce((s, c) => s + saldo(c), 0);
  const creditosRealizados = movimentos.filter((m) => m.tipo === "CREDITO").reduce((s, m) => s + Number(m.valor), 0);
  const debitosRealizados = movimentos.filter((m) => m.tipo === "DEBITO").reduce((s, m) => s + Number(m.valor), 0);
  const saldoAtual = bancos.reduce((s, b) => s + Number(b.saldoAtual), 0);
  const arred = (v: number) => Math.round(v * 100) / 100;
  return {
    periodoDias: dias,
    saldoAtualContas: arred(saldoAtual),
    projetado: {
      entradas: arred(entradasProjetadas),
      saidas: arred(saidasProjetadas),
      saldo: arred(entradasProjetadas - saidasProjetadas),
      saldoFinalEstimado: arred(saldoAtual + entradasProjetadas - saidasProjetadas),
      contasAReceber: receber.length,
      contasAPagar: pagar.length,
      entradasVencidas: arred(receber.filter((c) => c.vencimento < hoje).reduce((s, c) => s + saldo(c), 0)),
      saidasVencidas: arred(pagar.filter((c) => c.vencimento < hoje).reduce((s, c) => s + saldo(c), 0))
    },
    realizado: {
      creditos: arred(creditosRealizados),
      debitos: arred(debitosRealizados),
      saldo: arred(creditosRealizados - debitosRealizados)
    }
  };
}
