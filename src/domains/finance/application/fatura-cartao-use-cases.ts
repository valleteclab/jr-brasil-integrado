import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { cicloDaCompra, dividirParcelas } from "./fatura-cartao-ciclo";

/**
 * Fatura do cartão de crédito da empresa.
 *
 * Pagar um fornecedor no crédito não tira dinheiro do banco naquele dia: a compra entra na fatura
 * e o banco só é debitado quando a fatura é paga. Aqui ficam as três operações do ciclo:
 * lançar a compra, fechar a fatura (vira conta a pagar) e quitá-la.
 */

export class FaturaCartaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FaturaCartaoError";
  }
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Rótulo "12/2026" a partir da competência "2026-12". */
export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/**
 * Lança uma compra no cartão, dividindo entre as faturas quando for parcelada.
 * Roda DENTRO da transação da baixa — se a baixa falhar, a fatura não fica suja.
 */
export async function lancarCompraNoCartao(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  input: {
    cartaoId: string;
    contaPagarId: string | null;
    descricao: string;
    valor: number;
    parcelas: number;
    dataCompra: Date;
  }
): Promise<{ faturas: string[] }> {
  const cartao = await tx.contaBancaria.findFirst({
    where: { id: input.cartaoId, ...scopedByTenantCompany(scope) },
    select: { id: true, nome: true, tipo: true, cartaoDiaFechamento: true, cartaoDiaVencimento: true }
  });
  if (!cartao) throw new FaturaCartaoError("Cartão não encontrado nesta empresa.");
  if (cartao.tipo !== "CARTAO") throw new FaturaCartaoError("A conta selecionada não é um cartão de crédito.");
  if (!cartao.cartaoDiaFechamento || !cartao.cartaoDiaVencimento) {
    throw new FaturaCartaoError(
      `Informe o dia de fechamento e o de vencimento do cartão "${cartao.nome}" em Contas financeiras antes de pagar no crédito.`
    );
  }

  const valores = dividirParcelas(input.valor, input.parcelas);
  const faturasTocadas: string[] = [];

  for (let i = 0; i < valores.length; i += 1) {
    const ciclo = cicloDaCompra(input.dataCompra, cartao.cartaoDiaFechamento, cartao.cartaoDiaVencimento, i);

    // A fatura do ciclo é criada sob demanda; a unique por competência evita duplicar.
    const fatura = await tx.faturaCartao.upsert({
      where: {
        tenantId_empresaId_contaBancariaId_competencia: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          contaBancariaId: cartao.id,
          competencia: ciclo.competencia
        }
      },
      update: {},
      create: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ambiente: scope.ambiente ?? "HOMOLOGACAO",
        contaBancariaId: cartao.id,
        competencia: ciclo.competencia,
        fechamento: ciclo.fechamento,
        vencimento: ciclo.vencimento,
        valorTotal: 0,
        status: "ABERTA"
      },
      select: { id: true, status: true }
    });

    // Fatura já fechada não recebe compra nova: ela virou conta a pagar e mudar o valor agora
    // deixaria a conta e a fatura divergentes.
    if (fatura.status !== "ABERTA") {
      throw new FaturaCartaoError(
        `A fatura ${rotuloCompetencia(ciclo.competencia)} do cartão "${cartao.nome}" já está fechada. ` +
          "Lance esta compra na fatura aberta ou reabra a fechada."
      );
    }

    const sufixo = valores.length > 1 ? ` (${i + 1}/${valores.length})` : "";
    await tx.lancamentoFaturaCartao.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        faturaCartaoId: fatura.id,
        contaPagarId: input.contaPagarId,
        descricao: `${input.descricao}${sufixo}`,
        valor: valores[i],
        parcela: i + 1,
        totalParcelas: valores.length,
        dataCompra: input.dataCompra
      }
    });

    await tx.faturaCartao.update({
      where: { id: fatura.id },
      data: { valorTotal: { increment: valores[i] } }
    });
    faturasTocadas.push(fatura.id);
  }

  return { faturas: faturasTocadas };
}

/**
 * Fecha a fatura e gera a conta a pagar do vencimento. É o passo que transforma "dívida do
 * cartão" em "boleto a pagar", e é ele que faz o dinheiro sair do banco na data certa.
 */
export async function fecharFaturaCartao(scope: TenantScope, faturaId: string, usuarioId?: string) {
  return prisma.$transaction(async (tx) => {
    const fatura = await tx.faturaCartao.findFirst({
      where: { id: faturaId, ...scopedByTenantCompany(scope) },
      include: { contaBancaria: { select: { nome: true } } }
    });
    if (!fatura) throw new FaturaCartaoError("Fatura não encontrada.");
    if (fatura.status !== "ABERTA") throw new FaturaCartaoError("Esta fatura já foi fechada.");

    const total = Number(fatura.valorTotal);
    if (total <= 0) throw new FaturaCartaoError("Fatura sem lançamentos — não há o que fechar.");

    const descricao = `Fatura ${rotuloCompetencia(fatura.competencia)} — ${fatura.contaBancaria.nome}`;
    const contaPagar = await tx.contaPagar.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ambiente: scope.ambiente ?? "HOMOLOGACAO",
        descricao,
        vencimento: fatura.vencimento,
        valor: total,
        status: "ABERTO",
        origem: "FATURA_CARTAO"
      }
    });

    const atualizada = await tx.faturaCartao.update({
      where: { id: fatura.id },
      data: { status: "FECHADA", contaPagarId: contaPagar.id }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "FaturaCartao",
      entidadeId: fatura.id,
      acao: "FATURA_FECHADA",
      payload: { competencia: fatura.competencia, valor: total, contaPagarId: contaPagar.id },
      usuarioId
    });

    return atualizada;
  });
}

/**
 * Reabre a fatura (apaga a conta a pagar gerada), para corrigir um fechamento prematuro.
 * Só funciona enquanto a conta a pagar não tiver pagamento — senão o dinheiro já saiu.
 */
export async function reabrirFaturaCartao(scope: TenantScope, faturaId: string, usuarioId?: string) {
  return prisma.$transaction(async (tx) => {
    const fatura = await tx.faturaCartao.findFirst({
      where: { id: faturaId, ...scopedByTenantCompany(scope) },
      include: { contaPagar: { select: { id: true, valorPago: true } } }
    });
    if (!fatura) throw new FaturaCartaoError("Fatura não encontrada.");
    if (fatura.status === "PAGA") throw new FaturaCartaoError("Fatura já paga não pode ser reaberta.");
    if (fatura.status === "ABERTA") throw new FaturaCartaoError("Esta fatura já está aberta.");
    if (fatura.contaPagar && Number(fatura.contaPagar.valorPago) > 0) {
      throw new FaturaCartaoError("A conta desta fatura já tem pagamento — estorne a baixa antes de reabrir.");
    }

    const contaPagarId = fatura.contaPagar?.id ?? null;
    const atualizada = await tx.faturaCartao.update({
      where: { id: fatura.id },
      data: { status: "ABERTA", contaPagarId: null }
    });
    if (contaPagarId) await tx.contaPagar.delete({ where: { id: contaPagarId } });

    await createAuditLog(tx, {
      scope,
      entidade: "FaturaCartao",
      entidadeId: fatura.id,
      acao: "FATURA_REABERTA",
      payload: { competencia: fatura.competencia, contaPagarRemovida: contaPagarId },
      usuarioId
    });

    return atualizada;
  });
}

/**
 * Chamado quando a conta a pagar de uma fatura é quitada: marca a fatura como PAGA e devolve o
 * saldo do cartão (a dívida daquele ciclo deixou de existir). Silencioso quando a conta não é
 * fatura — serve para ser chamado direto da baixa.
 */
export async function quitarFaturaDaContaPagar(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  contaPagarId: string,
  valorPago: number
): Promise<void> {
  const fatura = await tx.faturaCartao.findFirst({
    where: { contaPagarId, ...scopedByTenantCompany(scope) },
    select: { id: true, contaBancariaId: true, status: true }
  });
  if (!fatura || fatura.status === "PAGA") return;

  await tx.faturaCartao.update({ where: { id: fatura.id }, data: { status: "PAGA" } });

  // A compra tinha reduzido o saldo do cartão (dívida); pagar a fatura devolve esse espaço.
  const cartao = await tx.contaBancaria.findUnique({
    where: { id: fatura.contaBancariaId },
    select: { saldoAtual: true }
  });
  if (cartao) {
    await tx.contaBancaria.update({
      where: { id: fatura.contaBancariaId },
      data: { saldoAtual: round2(Number(cartao.saldoAtual) + valorPago) }
    });
  }
}

/** Faturas do período para a tela, da mais recente para a mais antiga. */
export async function listarFaturasCartao(scope: TenantScope) {
  const faturas = await prisma.faturaCartao.findMany({
    where: { ...scopedByTenantCompany(scope) },
    include: {
      contaBancaria: { select: { nome: true } },
      contaPagar: { select: { id: true, status: true, valorPago: true } },
      _count: { select: { lancamentos: true } }
    },
    orderBy: [{ vencimento: "desc" }],
    take: 48
  });

  return faturas.map((f) => ({
    id: f.id,
    cartao: f.contaBancaria.nome,
    competencia: f.competencia,
    rotulo: rotuloCompetencia(f.competencia),
    fechamento: f.fechamento.toISOString(),
    vencimento: f.vencimento.toISOString(),
    valorTotal: Number(f.valorTotal),
    status: f.status,
    lancamentos: f._count.lancamentos,
    contaPagarId: f.contaPagar?.id ?? null
  }));
}

/** Lançamentos de uma fatura, para conferir contra a do banco. */
export async function listarLancamentosFatura(scope: TenantScope, faturaId: string) {
  const fatura = await prisma.faturaCartao.findFirst({
    where: { id: faturaId, ...scopedByTenantCompany(scope) },
    select: { id: true }
  });
  if (!fatura) throw new FaturaCartaoError("Fatura não encontrada.");

  const lancamentos = await prisma.lancamentoFaturaCartao.findMany({
    where: { faturaCartaoId: faturaId },
    orderBy: [{ dataCompra: "asc" }]
  });

  return lancamentos.map((l) => ({
    id: l.id,
    descricao: l.descricao,
    valor: Number(l.valor),
    parcela: l.parcela,
    totalParcelas: l.totalParcelas,
    dataCompra: l.dataCompra.toISOString(),
    contaPagarId: l.contaPagarId
  }));
}
