import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

const TX_OPTIONS = { maxWait: 10000, timeout: 20000 };

// ─── Erros de validação ───────────────────────────────────────────────────────

export class FinanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceValidationError";
  }
}

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export type SettleInput = {
  valor: number;
  juros?: number;
  multa?: number;
  descontoBaixa?: number;
  formaPagamento?: string;
  contaBancariaId?: string;
  dataPagamento?: Date;
  /** Detalhe do pagamento no cartão (qual maquininha/cartão, bandeira e parcelas; 1 = à vista). */
  maquinaCartaoId?: string | null;
  bandeira?: string | null;
  parcelas?: number | null;
};

export type CreatePayableInput = {
  descricao: string;
  fornecedorId?: string;
  valor: number;
  vencimento: Date;
  formaPagamento?: string;
  numeroDocumento?: string;
  observacoes?: string;
};

export type CreateReceivableInput = {
  descricao: string;
  clienteId: string;
  valor: number;
  vencimento: Date;
  formaPagamento?: string;
  numeroDocumento?: string;
  observacoes?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDecimal(value: number | undefined | null, fallback = 0): number {
  return value ?? fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ─── Baixa de Conta a Pagar ───────────────────────────────────────────────────

export async function settlePayable(
  scope: TenantScope,
  contaPagarId: string,
  input: SettleInput
) {
  if (!input.valor || input.valor <= 0) {
    throw new FinanceValidationError("O valor do pagamento deve ser maior que zero.");
  }
  // Conta bancária obrigatória: a baixa precisa refletir no saldo/fluxo de caixa.
  if (!input.contaBancariaId) {
    throw new FinanceValidationError("Selecione a conta bancária para registrar a baixa.");
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const conta = await tx.contaPagar.findFirst({
      where: { id: contaPagarId, ...scopedByTenantCompany(scope) }
    });

    if (!conta) {
      throw new FinanceValidationError("Conta a pagar não encontrada.");
    }
    if (conta.status === "PAGO" || conta.status === "CANCELADO") {
      throw new FinanceValidationError("Esta conta já está quitada ou cancelada.");
    }

    const valorAtual = Number(conta.valor);
    const valorJaPago = Number(conta.valorPago);
    const jurosAcumulados = Number(conta.juros);
    const multaAcumulada = Number(conta.multa);
    const descontoAcumulado = Number(conta.descontoBaixa);

    const saldoDevedor = round2(
      valorAtual + jurosAcumulados + multaAcumulada - descontoAcumulado - valorJaPago
    );

    if (input.valor > saldoDevedor + 0.001) {
      throw new FinanceValidationError(
        `O valor informado (${input.valor.toFixed(2)}) excede o saldo devedor (${saldoDevedor.toFixed(2)}).`
      );
    }

    const juros = toDecimal(input.juros);
    const multa = toDecimal(input.multa);
    const descontoBaixa = toDecimal(input.descontoBaixa);
    const valorLiquido = round2(input.valor + juros + multa - descontoBaixa);
    const novoValorPago = round2(valorJaPago + input.valor);
    const novoJuros = round2(jurosAcumulados + juros);
    const novaMulta = round2(multaAcumulada + multa);
    const novoDesconto = round2(descontoAcumulado + descontoBaixa);

    const novoSaldo = round2(
      valorAtual + novoJuros + novaMulta - novoDesconto - novoValorPago
    );
    const isPago = novoSaldo <= 0.001;
    const novoStatus: "PAGO" | "PARCIAL" = isPago ? "PAGO" : "PARCIAL";
    const dataPagamento = input.dataPagamento ?? new Date();

    const contaAtualizada = await tx.contaPagar.update({
      where: { id: contaPagarId },
      data: {
        valorPago: novoValorPago,
        juros: novoJuros,
        multa: novaMulta,
        descontoBaixa: novoDesconto,
        status: novoStatus,
        contaBancariaId: input.contaBancariaId ?? conta.contaBancariaId,
        pagoEm: isPago ? dataPagamento : conta.pagoEm,
        formaPagamento: input.formaPagamento ?? conta.formaPagamento
      }
    });

    // Cria movimento financeiro (DEBITO)
    let saldoAnterior: number | undefined;
    let saldoPosterior: number | undefined;

    if (input.contaBancariaId) {
      const contaBancaria = await tx.contaBancaria.findFirst({
        where: { id: input.contaBancariaId, ...scopedByTenantCompany(scope) }
      });
      if (!contaBancaria) {
        throw new FinanceValidationError("Conta bancária não encontrada.");
      }
      saldoAnterior = Number(contaBancaria.saldoAtual);
      saldoPosterior = round2(saldoAnterior - valorLiquido);

      await tx.contaBancaria.update({
        where: { id: input.contaBancariaId },
        data: { saldoAtual: saldoPosterior }
      });
    }

    const movimento = await tx.movimentoFinanceiro.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        contaBancariaId: input.contaBancariaId ?? null,
        contaPagarId,
        tipo: "DEBITO",
        origem: "CONTA_PAGAR",
        descricao: `Baixa de conta a pagar: ${conta.descricao}`,
        valor: valorLiquido,
        formaPagamento: input.formaPagamento ?? conta.formaPagamento ?? null,
        // Como foi pago (cartão): maquininha/cartão, bandeira e parcelas (1 = à vista).
        maquinaCartaoId: input.maquinaCartaoId ?? null,
        bandeira: input.bandeira ?? null,
        parcelas: input.parcelas ?? null,
        saldoAnterior: saldoAnterior ?? null,
        saldoPosterior: saldoPosterior ?? null,
        dataMovimento: dataPagamento
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "ContaPagar",
      entidadeId: contaPagarId,
      acao: isPago ? "BAIXA_TOTAL" : "BAIXA_PARCIAL",
      payload: {
        valor: input.valor,
        juros,
        multa,
        descontoBaixa,
        valorLiquido,
        novoStatus,
        movimentoId: movimento.id
      }
    });

    return contaAtualizada;
  }, TX_OPTIONS);
}

// ─── Baixa de Conta a Receber ─────────────────────────────────────────────────

export async function settleReceivable(
  scope: TenantScope,
  contaReceberId: string,
  input: SettleInput
) {
  if (!input.valor || input.valor <= 0) {
    throw new FinanceValidationError("O valor do recebimento deve ser maior que zero.");
  }
  // Conta bancária obrigatória: a baixa precisa refletir no saldo/fluxo de caixa.
  if (!input.contaBancariaId) {
    throw new FinanceValidationError("Selecione a conta bancária para registrar a baixa.");
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const conta = await tx.contaReceber.findFirst({
      where: { id: contaReceberId, ...scopedByTenantCompany(scope) }
    });

    if (!conta) {
      throw new FinanceValidationError("Conta a receber não encontrada.");
    }
    if (conta.status === "PAGO" || conta.status === "CANCELADO") {
      throw new FinanceValidationError("Esta conta já está quitada ou cancelada.");
    }

    const valorAtual = Number(conta.valor);
    const valorJaRecebido = Number(conta.valorPago);
    const jurosAcumulados = Number(conta.juros);
    const multaAcumulada = Number(conta.multa);
    const descontoAcumulado = Number(conta.descontoBaixa);

    const saldoDevedor = round2(
      valorAtual + jurosAcumulados + multaAcumulada - descontoAcumulado - valorJaRecebido
    );

    if (input.valor > saldoDevedor + 0.001) {
      throw new FinanceValidationError(
        `O valor informado (${input.valor.toFixed(2)}) excede o saldo a receber (${saldoDevedor.toFixed(2)}).`
      );
    }

    const juros = toDecimal(input.juros);
    const multa = toDecimal(input.multa);
    const descontoBaixa = toDecimal(input.descontoBaixa);
    const valorLiquido = round2(input.valor + juros + multa - descontoBaixa);
    const novoValorPago = round2(valorJaRecebido + input.valor);
    const novoJuros = round2(jurosAcumulados + juros);
    const novaMulta = round2(multaAcumulada + multa);
    const novoDesconto = round2(descontoAcumulado + descontoBaixa);

    const novoSaldo = round2(
      valorAtual + novoJuros + novaMulta - novoDesconto - novoValorPago
    );
    const isPago = novoSaldo <= 0.001;
    const novoStatus: "PAGO" | "PARCIAL" = isPago ? "PAGO" : "PARCIAL";
    const dataPagamento = input.dataPagamento ?? new Date();

    const contaAtualizada = await tx.contaReceber.update({
      where: { id: contaReceberId },
      data: {
        valorPago: novoValorPago,
        juros: novoJuros,
        multa: novaMulta,
        descontoBaixa: novoDesconto,
        status: novoStatus,
        contaBancariaId: input.contaBancariaId ?? conta.contaBancariaId,
        pagoEm: isPago ? dataPagamento : conta.pagoEm,
        formaPagamento: input.formaPagamento ?? conta.formaPagamento
      }
    });

    // Cria movimento financeiro (CREDITO)
    let saldoAnterior: number | undefined;
    let saldoPosterior: number | undefined;

    if (input.contaBancariaId) {
      const contaBancaria = await tx.contaBancaria.findFirst({
        where: { id: input.contaBancariaId, ...scopedByTenantCompany(scope) }
      });
      if (!contaBancaria) {
        throw new FinanceValidationError("Conta bancária não encontrada.");
      }
      saldoAnterior = Number(contaBancaria.saldoAtual);
      saldoPosterior = round2(saldoAnterior + valorLiquido);

      await tx.contaBancaria.update({
        where: { id: input.contaBancariaId },
        data: { saldoAtual: saldoPosterior }
      });
    }

    const movimento = await tx.movimentoFinanceiro.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        contaBancariaId: input.contaBancariaId ?? null,
        contaReceberId,
        tipo: "CREDITO",
        origem: "CONTA_RECEBER",
        descricao: `Baixa de conta a receber: ${conta.descricao}`,
        valor: valorLiquido,
        formaPagamento: input.formaPagamento ?? conta.formaPagamento ?? null,
        saldoAnterior: saldoAnterior ?? null,
        saldoPosterior: saldoPosterior ?? null,
        dataMovimento: dataPagamento
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "ContaReceber",
      entidadeId: contaReceberId,
      acao: isPago ? "BAIXA_TOTAL" : "BAIXA_PARCIAL",
      payload: {
        valor: input.valor,
        juros,
        multa,
        descontoBaixa,
        valorLiquido,
        novoStatus,
        movimentoId: movimento.id
      }
    });

    return contaAtualizada;
  }, TX_OPTIONS);
}

// ─── Criação Avulsa de Conta a Pagar ──────────────────────────────────────────

export async function createPayable(scope: TenantScope, input: CreatePayableInput) {
  if (!input.valor || input.valor <= 0) {
    throw new FinanceValidationError("O valor deve ser maior que zero.");
  }
  if (!input.descricao?.trim()) {
    throw new FinanceValidationError("A descrição é obrigatória.");
  }
  if (!input.vencimento) {
    throw new FinanceValidationError("A data de vencimento é obrigatória.");
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const conta = await tx.contaPagar.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        descricao: input.descricao.trim(),
        fornecedorId: input.fornecedorId ?? null,
        valor: input.valor,
        vencimento: input.vencimento,
        formaPagamento: input.formaPagamento ?? null,
        numeroDocumento: input.numeroDocumento ?? null,
        observacoes: input.observacoes ?? null,
        origem: "MANUAL",
        status: "ABERTO"
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "ContaPagar",
      entidadeId: conta.id,
      acao: "CREATE",
      payload: { valor: input.valor, vencimento: input.vencimento, origem: "MANUAL" }
    });

    return conta;
  }, TX_OPTIONS);
}

// ─── Criação Avulsa de Conta a Receber ───────────────────────────────────────

export async function createReceivable(scope: TenantScope, input: CreateReceivableInput) {
  if (!input.valor || input.valor <= 0) {
    throw new FinanceValidationError("O valor deve ser maior que zero.");
  }
  if (!input.descricao?.trim()) {
    throw new FinanceValidationError("A descrição é obrigatória.");
  }
  if (!input.clienteId) {
    throw new FinanceValidationError("O cliente é obrigatório.");
  }
  if (!input.vencimento) {
    throw new FinanceValidationError("A data de vencimento é obrigatória.");
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Valida que o cliente existe e pertence ao tenant/empresa (evita violar a FK com id inválido/placeholder).
    const cliente = await tx.cliente.findFirst({
      where: { id: input.clienteId, ...scopedByTenantCompany(scope) },
      select: { id: true }
    });
    if (!cliente) {
      throw new FinanceValidationError("Cliente não encontrado ou não pertence a esta empresa.");
    }

    const conta = await tx.contaReceber.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        descricao: input.descricao.trim(),
        clienteId: input.clienteId,
        valor: input.valor,
        vencimento: input.vencimento,
        formaPagamento: input.formaPagamento ?? null,
        numeroDocumento: input.numeroDocumento ?? null,
        observacoes: input.observacoes ?? null,
        origem: "MANUAL",
        status: "ABERTO"
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "ContaReceber",
      entidadeId: conta.id,
      acao: "CREATE",
      payload: { valor: input.valor, vencimento: input.vencimento, origem: "MANUAL" }
    });

    return conta;
  }, TX_OPTIONS);
}

/**
 * EXCLUI (remove) uma conta a PAGAR — ação ADMIN. Só permite quando NÃO há pagamento registrado
 * (valorPago = 0), para não orfanar movimentos financeiros/baixas. Desvincula eventuais
 * movimentos (FK nulável) e remove a conta.
 */
export async function deletePayable(scope: TenantScope, id: string) {
  const conta = await prisma.contaPagar.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    select: { id: true, descricao: true, status: true, valorPago: true }
  });
  if (!conta) throw new Error("Conta a pagar não encontrada.");
  if (Number(conta.valorPago) > 0 || conta.status === "PAGO" || conta.status === "PARCIAL") {
    throw new Error("Não é possível excluir uma conta a pagar com pagamento registrado. Estorne a baixa antes.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.movimentoFinanceiro.updateMany({ where: { contaPagarId: id }, data: { contaPagarId: null } });
    const removido = await tx.contaPagar.delete({ where: { id } });
    await createAuditLog(tx, {
      scope,
      entidade: "ContaPagar",
      entidadeId: id,
      acao: "DELETE",
      payload: { descricao: conta.descricao, status: conta.status }
    });
    return removido;
  });
}

// ─── Estorno de Baixa de Conta a Pagar ────────────────────────────────────────

/**
 * ESTORNA a baixa de uma conta a PAGAR: desfaz o(s) pagamento(s) registrado(s).
 * Para cada MovimentoFinanceiro de baixa (origem CONTA_PAGAR), cria um movimento INVERSO
 * (CREDITO, origem "ESTORNO") devolvendo o valor ao saldo da conta bancária, e zera
 * valorPago/juros/multa/descontoBaixa da conta, voltando o status para ABERTO (ou VENCIDO).
 */
export async function estornarBaixaPayable(scope: TenantScope, contaPagarId: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Relê dentro da transação para tratar concorrência (duas requisições simultâneas).
    const conta = await tx.contaPagar.findFirst({
      where: { id: contaPagarId, ...scopedByTenantCompany(scope) }
    });

    if (!conta) {
      throw new FinanceValidationError("Conta a pagar não encontrada.");
    }
    const houveBaixa =
      Number(conta.valorPago) > 0 && (conta.status === "PAGO" || conta.status === "PARCIAL");
    if (!houveBaixa) {
      throw new FinanceValidationError("Não há baixa para estornar.");
    }

    // Movimentos de baixa desta conta (DEBITO, origem CONTA_PAGAR) — não inclui estornos anteriores.
    const movimentos = await tx.movimentoFinanceiro.findMany({
      where: { contaPagarId, origem: "CONTA_PAGAR", ...scopedByTenantCompany(scope) },
      orderBy: { dataMovimento: "asc" }
    });

    const agora = new Date();

    // Para cada baixa, devolve o valor à conta bancária (estorno = CREDITO inverso ao DEBITO).
    for (const mov of movimentos) {
      if (!mov.contaBancariaId) continue; // baixa sem conta bancária: nada a reverter no saldo
      const valor = Number(mov.valor);

      const contaBancaria = await tx.contaBancaria.findFirst({
        where: { id: mov.contaBancariaId, ...scopedByTenantCompany(scope) }
      });
      if (!contaBancaria) {
        throw new FinanceValidationError("Conta bancária do movimento não encontrada.");
      }
      const saldoAnterior = Number(contaBancaria.saldoAtual);
      const saldoPosterior = round2(saldoAnterior + valor); // devolve o que foi debitado

      await tx.contaBancaria.update({
        where: { id: mov.contaBancariaId },
        data: { saldoAtual: saldoPosterior }
      });

      await tx.movimentoFinanceiro.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          contaBancariaId: mov.contaBancariaId,
          contaPagarId,
          tipo: "CREDITO", // inverso do DEBITO da baixa original
          origem: "ESTORNO",
          descricao: `Estorno de baixa: ${conta.descricao}`,
          valor,
          formaPagamento: mov.formaPagamento,
          saldoAnterior,
          saldoPosterior,
          dataMovimento: agora
        }
      });
    }

    // Volta a conta ao estado "em aberto": zera o que foi acumulado na baixa e limpa pagoEm.
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const novoStatus: "ABERTO" | "VENCIDO" = conta.vencimento < hoje ? "VENCIDO" : "ABERTO";

    const contaAtualizada = await tx.contaPagar.update({
      where: { id: contaPagarId },
      data: {
        valorPago: 0,
        juros: 0,
        multa: 0,
        descontoBaixa: 0,
        status: novoStatus,
        pagoEm: null
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "ContaPagar",
      entidadeId: contaPagarId,
      acao: "ESTORNO_BAIXA",
      payload: {
        valorEstornado: Number(conta.valorPago),
        movimentosRevertidos: movimentos.length,
        statusAnterior: conta.status,
        novoStatus
      }
    });

    return contaAtualizada;
  }, TX_OPTIONS);
}

// ─── Estorno de Baixa de Conta a Receber ──────────────────────────────────────

/**
 * ESTORNA a baixa de uma conta a RECEBER: desfaz o(s) recebimento(s) registrado(s).
 * Para cada MovimentoFinanceiro de baixa (origem CONTA_RECEBER), cria um movimento INVERSO
 * (DEBITO, origem "ESTORNO") subtraindo do saldo da conta bancária o que havia sido creditado.
 */
export async function estornarBaixaReceivable(scope: TenantScope, contaReceberId: string) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Relê dentro da transação para tratar concorrência (duas requisições simultâneas).
    const conta = await tx.contaReceber.findFirst({
      where: { id: contaReceberId, ...scopedByTenantCompany(scope) }
    });

    if (!conta) {
      throw new FinanceValidationError("Conta a receber não encontrada.");
    }
    const houveBaixa =
      Number(conta.valorPago) > 0 && (conta.status === "PAGO" || conta.status === "PARCIAL");
    if (!houveBaixa) {
      throw new FinanceValidationError("Não há baixa para estornar.");
    }

    // Movimentos de baixa desta conta (CREDITO, origem CONTA_RECEBER) — não inclui estornos anteriores.
    const movimentos = await tx.movimentoFinanceiro.findMany({
      where: { contaReceberId, origem: "CONTA_RECEBER", ...scopedByTenantCompany(scope) },
      orderBy: { dataMovimento: "asc" }
    });

    const agora = new Date();

    // Para cada baixa, retira o valor da conta bancária (estorno = DEBITO inverso ao CREDITO).
    for (const mov of movimentos) {
      if (!mov.contaBancariaId) continue; // baixa sem conta bancária: nada a reverter no saldo
      const valor = Number(mov.valor);

      const contaBancaria = await tx.contaBancaria.findFirst({
        where: { id: mov.contaBancariaId, ...scopedByTenantCompany(scope) }
      });
      if (!contaBancaria) {
        throw new FinanceValidationError("Conta bancária do movimento não encontrada.");
      }
      const saldoAnterior = Number(contaBancaria.saldoAtual);
      const saldoPosterior = round2(saldoAnterior - valor); // retira o que foi creditado

      await tx.contaBancaria.update({
        where: { id: mov.contaBancariaId },
        data: { saldoAtual: saldoPosterior }
      });

      await tx.movimentoFinanceiro.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          contaBancariaId: mov.contaBancariaId,
          contaReceberId,
          tipo: "DEBITO", // inverso do CREDITO da baixa original
          origem: "ESTORNO",
          descricao: `Estorno de baixa: ${conta.descricao}`,
          valor,
          formaPagamento: mov.formaPagamento,
          saldoAnterior,
          saldoPosterior,
          dataMovimento: agora
        }
      });
    }

    // Volta a conta ao estado "em aberto": zera o que foi acumulado na baixa e limpa pagoEm.
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const novoStatus: "ABERTO" | "VENCIDO" = conta.vencimento < hoje ? "VENCIDO" : "ABERTO";

    const contaAtualizada = await tx.contaReceber.update({
      where: { id: contaReceberId },
      data: {
        valorPago: 0,
        juros: 0,
        multa: 0,
        descontoBaixa: 0,
        status: novoStatus,
        pagoEm: null
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "ContaReceber",
      entidadeId: contaReceberId,
      acao: "ESTORNO_BAIXA",
      payload: {
        valorEstornado: Number(conta.valorPago),
        movimentosRevertidos: movimentos.length,
        statusAnterior: conta.status,
        novoStatus
      }
    });

    return contaAtualizada;
  }, TX_OPTIONS);
}
