/**
 * Cadastro de CONTAS FINANCEIRAS (carteiras: caixa, banco, cartão) e FORMAS DE PAGAMENTO
 * (dinheiro, pix, cartão, boleto…). São configurados na empresa e reutilizados onde o sistema
 * pede meio de pagamento (a começar pela entrada de notas), padronizando os dados para relatórios.
 *
 * Conta financeira reaproveita o model ContaBancaria (já existente, com saldo e movimentos).
 * Forma de pagamento é o model FormaPagamento e pode apontar para uma conta padrão.
 */
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

export class PaymentConfigError extends Error {}

// ─── Tipos e rótulos ─────────────────────────────────────────────────────────────

export const TIPOS_CONTA_FINANCEIRA = ["CAIXA", "CORRENTE", "POUPANCA", "CARTAO"] as const;
export type TipoContaFinanceira = (typeof TIPOS_CONTA_FINANCEIRA)[number];

export const TIPOS_FORMA_PAGAMENTO = [
  "DINHEIRO",
  "PIX",
  "CARTAO_CREDITO",
  "CARTAO_DEBITO",
  "BOLETO",
  "TRANSFERENCIA",
  "CHEQUE",
  "OUTRO"
] as const;
export type TipoFormaPagamento = (typeof TIPOS_FORMA_PAGAMENTO)[number];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function required(value: unknown, label: string): string {
  const text = clean(value);
  if (!text) throw new PaymentConfigError(`${label} é obrigatório.`);
  return text;
}

// ─── Contas financeiras (ContaBancaria) ───────────────────────────────────────────

export type ContaFinanceiraInput = {
  nome?: string;
  tipo?: string;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  saldoInicial?: number | null;
  ativo?: boolean;
};

function normalizeTipoConta(value: unknown): TipoContaFinanceira {
  const tipo = clean(value).toUpperCase() as TipoContaFinanceira;
  if (!TIPOS_CONTA_FINANCEIRA.includes(tipo)) throw new PaymentConfigError("Tipo de conta inválido.");
  return tipo;
}

export async function listContasFinanceiras(scope: TenantScope) {
  return prisma.contaBancaria.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }]
  });
}

export async function createContaFinanceira(scope: TenantScope, input: ContaFinanceiraInput) {
  const nome = required(input.nome, "Nome da conta");
  const tipo = normalizeTipoConta(input.tipo);
  const saldoInicial = Number(input.saldoInicial ?? 0) || 0;

  const conta = await prisma.contaBancaria.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      nome,
      tipo,
      banco: clean(input.banco) || null,
      agencia: clean(input.agencia) || null,
      conta: clean(input.conta) || null,
      saldoInicial,
      saldoAtual: saldoInicial,
      ativo: input.ativo ?? true
    }
  });
  await createAuditLog(prisma, { scope, entidade: "ContaBancaria", entidadeId: conta.id, acao: "CREATE", payload: { nome, tipo } });
  return conta;
}

export async function updateContaFinanceira(scope: TenantScope, id: string, input: ContaFinanceiraInput) {
  const existente = await prisma.contaBancaria.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!existente) throw new PaymentConfigError("Conta financeira não encontrada.");

  const conta = await prisma.contaBancaria.update({
    where: { id },
    data: {
      ...(input.nome !== undefined ? { nome: required(input.nome, "Nome da conta") } : {}),
      ...(input.tipo !== undefined ? { tipo: normalizeTipoConta(input.tipo) } : {}),
      ...(input.banco !== undefined ? { banco: clean(input.banco) || null } : {}),
      ...(input.agencia !== undefined ? { agencia: clean(input.agencia) || null } : {}),
      ...(input.conta !== undefined ? { conta: clean(input.conta) || null } : {}),
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {})
    }
  });
  await createAuditLog(prisma, { scope, entidade: "ContaBancaria", entidadeId: conta.id, acao: "UPDATE", payload: { nome: conta.nome } });
  return conta;
}

export async function archiveContaFinanceira(scope: TenantScope, id: string) {
  const existente = await prisma.contaBancaria.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!existente) throw new PaymentConfigError("Conta financeira não encontrada.");
  const conta = await prisma.contaBancaria.update({ where: { id }, data: { ativo: false } });
  await createAuditLog(prisma, { scope, entidade: "ContaBancaria", entidadeId: id, acao: "ARCHIVE", payload: { nome: conta.nome } });
  return conta;
}

// ─── Formas de pagamento (FormaPagamento) ─────────────────────────────────────────

export type FormaPagamentoInput = {
  nome?: string;
  tipo?: string;
  contaBancariaId?: string | null;
  ordem?: number | null;
  ativo?: boolean;
};

function normalizeTipoForma(value: unknown): TipoFormaPagamento {
  const tipo = clean(value).toUpperCase() as TipoFormaPagamento;
  if (!TIPOS_FORMA_PAGAMENTO.includes(tipo)) throw new PaymentConfigError("Tipo de forma de pagamento inválido.");
  return tipo;
}

async function resolveContaBancariaId(scope: TenantScope, contaBancariaId: string | null | undefined): Promise<string | null> {
  const id = clean(contaBancariaId) || null;
  if (!id) return null;
  const conta = await prisma.contaBancaria.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId }, select: { id: true } });
  if (!conta) throw new PaymentConfigError("Conta financeira vinculada não pertence a esta empresa.");
  return id;
}

export async function listFormasPagamento(scope: TenantScope) {
  return prisma.formaPagamento.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { nome: "asc" }],
    include: { contaBancaria: { select: { id: true, nome: true } } }
  });
}

/** Apenas formas ativas — para os seletores de meio de pagamento nas telas operacionais. */
export async function listFormasPagamentoAtivas(scope: TenantScope) {
  return prisma.formaPagamento.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, tipo: true }
  });
}

export async function createFormaPagamento(scope: TenantScope, input: FormaPagamentoInput) {
  const nome = required(input.nome, "Nome da forma de pagamento");
  const tipo = normalizeTipoForma(input.tipo);
  const contaBancariaId = await resolveContaBancariaId(scope, input.contaBancariaId);

  const forma = await prisma.formaPagamento.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      nome,
      tipo,
      contaBancariaId,
      ordem: Number(input.ordem ?? 0) || 0,
      ativo: input.ativo ?? true
    }
  });
  await createAuditLog(prisma, { scope, entidade: "FormaPagamento", entidadeId: forma.id, acao: "CREATE", payload: { nome, tipo } });
  return forma;
}

export async function updateFormaPagamento(scope: TenantScope, id: string, input: FormaPagamentoInput) {
  const existente = await prisma.formaPagamento.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!existente) throw new PaymentConfigError("Forma de pagamento não encontrada.");

  const forma = await prisma.formaPagamento.update({
    where: { id },
    data: {
      ...(input.nome !== undefined ? { nome: required(input.nome, "Nome da forma de pagamento") } : {}),
      ...(input.tipo !== undefined ? { tipo: normalizeTipoForma(input.tipo) } : {}),
      ...(input.contaBancariaId !== undefined ? { contaBancariaId: await resolveContaBancariaId(scope, input.contaBancariaId) } : {}),
      ...(input.ordem !== undefined ? { ordem: Number(input.ordem ?? 0) || 0 } : {}),
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {})
    }
  });
  await createAuditLog(prisma, { scope, entidade: "FormaPagamento", entidadeId: forma.id, acao: "UPDATE", payload: { nome: forma.nome } });
  return forma;
}

export async function archiveFormaPagamento(scope: TenantScope, id: string) {
  const existente = await prisma.formaPagamento.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!existente) throw new PaymentConfigError("Forma de pagamento não encontrada.");
  const forma = await prisma.formaPagamento.update({ where: { id }, data: { ativo: false } });
  await createAuditLog(prisma, { scope, entidade: "FormaPagamento", entidadeId: id, acao: "ARCHIVE", payload: { nome: forma.nome } });
  return forma;
}
