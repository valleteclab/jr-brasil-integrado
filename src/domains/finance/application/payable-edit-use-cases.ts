import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { FinanceValidationError, settlePayable } from "./finance-use-cases";

/**
 * CORREÇÃO E BAIXA EM LOTE DE CONTAS A PAGAR.
 *
 * Nota de entrada cujo XML não traz duplicata vira uma parcela única, com forma "Informar" e
 * vencimento na data do lançamento. Até aqui o sistema só permitia EXCLUIR e refazer — o que
 * apaga o vínculo com a entrada fiscal. Estas operações corrigem no lugar:
 *   - editar: vencimento, valor, forma, conta, documento, fornecedor e observações;
 *   - parcelar: quebra a conta em N parcelas (a original vira a 1ª, mantendo o vínculo);
 *   - baixar em lote: fecha o mês inteiro numa operação, uma baixa por conta.
 * Tudo auditado, e nada disso toca conta já paga ou cancelada.
 */

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function garantirEditavel(conta: { status: string; valorPago: unknown }) {
  if (conta.status === "PAGO" || conta.status === "CANCELADO") {
    throw new FinanceValidationError("Conta já quitada ou cancelada: estorne a baixa antes de alterar.");
  }
  if (Number(conta.valorPago ?? 0) > 0) {
    throw new FinanceValidationError("Esta conta tem baixa parcial. Estorne a baixa antes de alterar.");
  }
}

export type EditPayableInput = {
  descricao?: string;
  valor?: number;
  vencimento?: string | Date;
  formaPagamento?: string | null;
  contaBancariaId?: string | null;
  numeroDocumento?: string | null;
  fornecedorId?: string | null;
  observacoes?: string | null;
  classificacaoId?: string | null;
};

export async function editPayable(scope: TenantScope, id: string, input: EditPayableInput, usuarioId?: string) {
  const conta = await prisma.contaPagar.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!conta) throw new FinanceValidationError("Conta a pagar não encontrada.");
  garantirEditavel(conta);

  const data: Prisma.ContaPagarUpdateInput = {};
  const antes: Record<string, unknown> = {};

  if (input.descricao !== undefined) {
    const d = input.descricao.trim();
    if (!d) throw new FinanceValidationError("A descrição não pode ficar vazia.");
    antes.descricao = conta.descricao;
    data.descricao = d;
  }
  if (input.valor !== undefined) {
    if (!Number.isFinite(input.valor) || input.valor <= 0) throw new FinanceValidationError("O valor deve ser maior que zero.");
    antes.valor = Number(conta.valor);
    data.valor = round2(input.valor);
  }
  if (input.vencimento !== undefined) {
    const v = new Date(input.vencimento);
    if (Number.isNaN(v.getTime())) throw new FinanceValidationError("Data de vencimento inválida.");
    antes.vencimento = conta.vencimento;
    data.vencimento = v;
  }
  if (input.formaPagamento !== undefined) {
    antes.formaPagamento = conta.formaPagamento;
    data.formaPagamento = input.formaPagamento?.trim() || null;
  }
  if (input.numeroDocumento !== undefined) {
    antes.numeroDocumento = conta.numeroDocumento;
    data.numeroDocumento = input.numeroDocumento?.trim() || null;
  }
  if (input.observacoes !== undefined) {
    antes.observacoes = conta.observacoes;
    data.observacoes = input.observacoes?.trim() || null;
  }
  if (input.contaBancariaId !== undefined) {
    if (input.contaBancariaId) {
      const cb = await prisma.contaBancaria.findFirst({ where: { id: input.contaBancariaId, ...scopedByTenantCompany(scope) } });
      if (!cb) throw new FinanceValidationError("Conta financeira não encontrada nesta empresa.");
    }
    antes.contaBancariaId = conta.contaBancariaId;
    data.contaBancaria = input.contaBancariaId ? { connect: { id: input.contaBancariaId } } : { disconnect: true };
  }
  if (input.fornecedorId !== undefined) {
    if (input.fornecedorId) {
      const f = await prisma.fornecedor.findFirst({ where: { id: input.fornecedorId, ...scopedByTenantCompany(scope) } });
      if (!f) throw new FinanceValidationError("Fornecedor não encontrado nesta empresa.");
    }
    antes.fornecedorId = conta.fornecedorId;
    data.fornecedor = input.fornecedorId ? { connect: { id: input.fornecedorId } } : { disconnect: true };
  }
  if (input.classificacaoId !== undefined) {
    antes.classificacaoId = conta.classificacaoId;
    data.classificacao = input.classificacaoId ? { connect: { id: input.classificacaoId } } : { disconnect: true };
  }

  if (Object.keys(data).length === 0) return conta;

  const atualizada = await prisma.contaPagar.update({ where: { id: conta.id }, data });
  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, { scope, usuarioId, entidade: "ContaPagar", entidadeId: conta.id, acao: "CONTA_PAGAR_EDITADA", payload: JSON.parse(JSON.stringify({ antes, depois: input })) })
  );
  return atualizada;
}

/**
 * Quebra a conta em N parcelas. A conta original vira a 1ª (preservando o vínculo com a entrada
 * fiscal e a classificação); as demais nascem como contas novas, com a mesma origem e documento.
 * As datas seguem o intervalo informado (padrão: de 30 em 30 dias a partir do 1º vencimento).
 */
export async function splitPayable(
  scope: TenantScope,
  id: string,
  input: { parcelas: number; primeiroVencimento?: string | Date; intervaloDias?: number; valores?: number[] },
  usuarioId?: string
) {
  const conta = await prisma.contaPagar.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!conta) throw new FinanceValidationError("Conta a pagar não encontrada.");
  garantirEditavel(conta);

  const n = Math.trunc(input.parcelas);
  if (!Number.isFinite(n) || n < 2 || n > 60) throw new FinanceValidationError("Informe de 2 a 60 parcelas.");

  const total = round2(Number(conta.valor));
  const intervalo = input.intervaloDias && input.intervaloDias > 0 ? Math.trunc(input.intervaloDias) : 30;
  const primeiro = input.primeiroVencimento ? new Date(input.primeiroVencimento) : conta.vencimento;
  if (Number.isNaN(primeiro.getTime())) throw new FinanceValidationError("Data do primeiro vencimento inválida.");

  let valores: number[];
  if (input.valores?.length) {
    if (input.valores.length !== n) throw new FinanceValidationError("A lista de valores precisa ter uma entrada por parcela.");
    valores = input.valores.map((v) => round2(Number(v)));
    const soma = round2(valores.reduce((a, v) => a + v, 0));
    if (Math.abs(soma - total) > 0.01) {
      throw new FinanceValidationError(`A soma das parcelas (${soma.toFixed(2)}) precisa fechar com o valor da conta (${total.toFixed(2)}).`);
    }
  } else {
    // Divisão igual com o resto (centavos) na PRIMEIRA parcela, para a soma fechar exata.
    const base = Math.floor((total * 100) / n) / 100;
    valores = Array.from({ length: n }, () => base);
    valores[0] = round2(total - base * (n - 1));
  }

  const vencimentos = Array.from({ length: n }, (_, i) => {
    const d = new Date(primeiro);
    d.setDate(d.getDate() + intervalo * i);
    return d;
  });

  const descricaoBase = conta.descricao.replace(/\s*-\s*parcela\s*\d+\/\d+\s*$/i, "");

  return prisma.$transaction(async (tx) => {
    await tx.contaPagar.update({
      where: { id: conta.id },
      data: { valor: valores[0], vencimento: vencimentos[0], descricao: `${descricaoBase} - parcela 1/${n}` }
    });

    for (let i = 1; i < n; i++) {
      await tx.contaPagar.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          ambiente: conta.ambiente,
          descricao: `${descricaoBase} - parcela ${i + 1}/${n}`,
          fornecedorId: conta.fornecedorId,
          entradaFiscalId: conta.entradaFiscalId,
          numeroDocumento: conta.numeroDocumento,
          formaPagamento: conta.formaPagamento,
          contaBancariaId: conta.contaBancariaId,
          classificacaoId: conta.classificacaoId,
          observacoes: conta.observacoes,
          origem: conta.origem,
          vencimento: vencimentos[i],
          valor: valores[i],
          status: "ABERTO"
        }
      });
    }

    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ContaPagar",
      entidadeId: conta.id,
      acao: "CONTA_PAGAR_PARCELADA",
      payload: { parcelas: n, total, valores, vencimentos: vencimentos.map((d) => d.toISOString()) }
    });

    return { parcelas: n, total };
  });
}

export type BaixaLoteResultado = {
  baixadas: number;
  valorTotal: number;
  falhas: Array<{ contaPagarId: string; descricao: string; erro: string }>;
};

/**
 * Baixa VÁRIAS contas a pagar na mesma conta financeira e data — é o fechamento do mês em uma
 * operação. Cada conta é baixada pelo caminho normal (settlePayable), para que o saldo, o
 * movimento financeiro e a auditoria saiam idênticos à baixa manual. Uma conta que falhar não
 * derruba as outras: volta na lista de falhas com o motivo.
 */
export async function settlePayablesEmLote(
  scope: TenantScope,
  input: { contaPagarIds: string[]; contaBancariaId: string; dataPagamento?: string | Date; formaPagamento?: string | null },
  usuarioId?: string
): Promise<BaixaLoteResultado> {
  const ids = [...new Set((input.contaPagarIds ?? []).filter(Boolean))];
  if (ids.length === 0) throw new FinanceValidationError("Selecione ao menos uma conta para baixar.");
  if (ids.length > 300) throw new FinanceValidationError("Baixe no máximo 300 contas por vez.");
  if (!input.contaBancariaId) throw new FinanceValidationError("Selecione a conta financeira da baixa.");

  const contas = await prisma.contaPagar.findMany({
    where: { id: { in: ids }, ...scopedByTenantCompany(scope), status: { in: ["ABERTO", "VENCIDO", "PARCIAL"] } },
    select: { id: true, descricao: true, valor: true, valorPago: true, juros: true, multa: true, descontoBaixa: true, formaPagamento: true }
  });

  const dataPagamento = input.dataPagamento ? new Date(input.dataPagamento) : new Date();
  if (Number.isNaN(dataPagamento.getTime())) throw new FinanceValidationError("Data de pagamento inválida.");

  const resultado: BaixaLoteResultado = { baixadas: 0, valorTotal: 0, falhas: [] };

  for (const conta of contas) {
    const saldo = round2(
      Number(conta.valor) + Number(conta.juros ?? 0) + Number(conta.multa ?? 0) - Number(conta.descontoBaixa ?? 0) - Number(conta.valorPago ?? 0)
    );
    if (saldo <= 0) continue;
    try {
      await settlePayable(scope, conta.id, {
        valor: saldo,
        contaBancariaId: input.contaBancariaId,
        dataPagamento,
        formaPagamento: input.formaPagamento?.trim() || conta.formaPagamento || undefined
      });
      resultado.baixadas += 1;
      resultado.valorTotal = round2(resultado.valorTotal + saldo);
    } catch (e) {
      resultado.falhas.push({ contaPagarId: conta.id, descricao: conta.descricao, erro: e instanceof Error ? e.message : "Falha na baixa." });
    }
  }

  const naoEncontradas = ids.filter((id) => !contas.some((c) => c.id === id));
  for (const id of naoEncontradas) {
    resultado.falhas.push({ contaPagarId: id, descricao: "", erro: "Conta não encontrada ou já quitada/cancelada." });
  }

  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ContaPagar",
      entidadeId: scope.empresaId,
      acao: "CONTA_PAGAR_BAIXA_LOTE",
      payload: {
        contas: resultado.baixadas,
        valorTotal: resultado.valorTotal,
        contaBancariaId: input.contaBancariaId,
        dataPagamento: dataPagamento.toISOString(),
        falhas: resultado.falhas.length
      }
    })
  );

  return resultado;
}
