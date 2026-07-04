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

export const TIPOS_CHAVE_PIX = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"] as const;

export type ContaFinanceiraInput = {
  nome?: string;
  tipo?: string;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  chavePix?: string | null;
  tipoChavePix?: string | null;
  saldoInicial?: number | null;
  ativo?: boolean;
};

function normalizeTipoConta(value: unknown): TipoContaFinanceira {
  const tipo = clean(value).toUpperCase() as TipoContaFinanceira;
  if (!TIPOS_CONTA_FINANCEIRA.includes(tipo)) throw new PaymentConfigError("Tipo de conta inválido.");
  return tipo;
}

/**
 * Valida a chave Pix conforme o tipo escolhido (evita cadastrar chave que o banco vai recusar
 * na cobrança). Só valida quando chave e tipo estão preenchidos.
 */
export function validarChavePix(chave: string, tipo: string): void {
  const c = clean(chave);
  if (!c) return;
  const t = clean(tipo).toUpperCase();
  const soDigitos = c.replace(/\D+/g, "");
  switch (t) {
    case "CPF":
      if (soDigitos.length !== 11) throw new PaymentConfigError("Chave Pix CPF deve ter 11 dígitos.");
      break;
    case "CNPJ":
      if (soDigitos.length !== 14) throw new PaymentConfigError("Chave Pix CNPJ deve ter 14 dígitos.");
      break;
    case "EMAIL":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) throw new PaymentConfigError("Chave Pix e-mail inválida.");
      break;
    case "TELEFONE":
      // E.164 br: +55 + DDD + número (10 ou 11 dígitos nacionais).
      if (soDigitos.length < 10 || soDigitos.length > 13) throw new PaymentConfigError("Chave Pix telefone inválida (informe DDD + número).");
      break;
    case "ALEATORIA":
      if (!/^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/.test(c)) {
        throw new PaymentConfigError("Chave Pix aleatória deve ser um EVP (UUID de 32 caracteres).");
      }
      break;
    default:
      throw new PaymentConfigError("Selecione o tipo da chave Pix (CPF, CNPJ, e-mail, telefone ou aleatória).");
  }
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
  if (clean(input.chavePix)) validarChavePix(clean(input.chavePix), clean(input.tipoChavePix));

  const conta = await prisma.contaBancaria.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      nome,
      tipo,
      banco: clean(input.banco) || null,
      agencia: clean(input.agencia) || null,
      conta: clean(input.conta) || null,
      chavePix: clean(input.chavePix) || null,
      tipoChavePix: clean(input.tipoChavePix).toUpperCase() || null,
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

  // Valida a chave Pix contra o tipo (novo tipo ou o já salvo).
  const chaveFinal = input.chavePix !== undefined ? clean(input.chavePix) : (existente.chavePix ?? "");
  const tipoChaveFinal = input.tipoChavePix !== undefined ? clean(input.tipoChavePix) : (existente.tipoChavePix ?? "");
  if (chaveFinal) validarChavePix(chaveFinal, tipoChaveFinal);

  // Correção do SALDO INICIAL: ajusta o saldo atual pelo mesmo delta (não recalcula do zero,
  // preserva os movimentos já lançados) e registra o antes/depois na auditoria.
  let ajusteSaldo: { saldoInicialAnterior: number; saldoInicialNovo: number; saldoAtualNovo: number } | null = null;
  if (input.saldoInicial !== undefined && input.saldoInicial !== null) {
    const novoInicial = Number(input.saldoInicial) || 0;
    const inicialAnterior = Number(existente.saldoInicial);
    const delta = Math.round((novoInicial - inicialAnterior) * 100) / 100;
    if (delta !== 0) {
      ajusteSaldo = {
        saldoInicialAnterior: inicialAnterior,
        saldoInicialNovo: novoInicial,
        saldoAtualNovo: Math.round((Number(existente.saldoAtual) + delta) * 100) / 100
      };
    }
  }

  const conta = await prisma.contaBancaria.update({
    where: { id },
    data: {
      ...(input.nome !== undefined ? { nome: required(input.nome, "Nome da conta") } : {}),
      ...(input.tipo !== undefined ? { tipo: normalizeTipoConta(input.tipo) } : {}),
      ...(input.banco !== undefined ? { banco: clean(input.banco) || null } : {}),
      ...(input.agencia !== undefined ? { agencia: clean(input.agencia) || null } : {}),
      ...(input.conta !== undefined ? { conta: clean(input.conta) || null } : {}),
      ...(input.chavePix !== undefined ? { chavePix: clean(input.chavePix) || null } : {}),
      ...(input.tipoChavePix !== undefined ? { tipoChavePix: clean(input.tipoChavePix).toUpperCase() || null } : {}),
      ...(ajusteSaldo ? { saldoInicial: ajusteSaldo.saldoInicialNovo, saldoAtual: ajusteSaldo.saldoAtualNovo } : {}),
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {})
    }
  });
  await createAuditLog(prisma, {
    scope,
    entidade: "ContaBancaria",
    entidadeId: conta.id,
    acao: ajusteSaldo ? "AJUSTE_SALDO_INICIAL" : "UPDATE",
    payload: ajusteSaldo ? { nome: conta.nome, ...ajusteSaldo } : { nome: conta.nome }
  });
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
    select: { id: true, nome: true, tipo: true, contaBancariaId: true }
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

// ─── Máquinas de cartão (MaquinaCartao) ───────────────────────────────────────────

export type MaquinaCartaoInput = {
  nome?: string;
  adquirente?: string | null;
  contaBancariaId?: string | null;
  taxaDebito?: number | null;
  taxaCredito?: number | null;
  taxaCreditoParcelado?: number | null;
  prazoDebitoDias?: number | null;
  prazoCreditoDias?: number | null;
  ativo?: boolean;
};

const num = (v: unknown, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
const int = (v: unknown, def = 0) => Math.max(0, Math.round(num(v, def)));

export async function listMaquinasCartao(scope: TenantScope) {
  return prisma.maquinaCartao.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }]
  });
}

export async function createMaquinaCartao(scope: TenantScope, input: MaquinaCartaoInput) {
  const nome = required(input.nome, "Nome da máquina");
  const m = await prisma.maquinaCartao.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      nome,
      adquirente: clean(input.adquirente) || null,
      contaBancariaId: clean(input.contaBancariaId) || null,
      taxaDebito: num(input.taxaDebito),
      taxaCredito: num(input.taxaCredito),
      taxaCreditoParcelado: num(input.taxaCreditoParcelado),
      prazoDebitoDias: int(input.prazoDebitoDias, 1),
      prazoCreditoDias: int(input.prazoCreditoDias, 30),
      ativo: input.ativo ?? true
    }
  });
  await createAuditLog(prisma, { scope, entidade: "MaquinaCartao", entidadeId: m.id, acao: "CREATE", payload: { nome } });
  return m;
}

export async function updateMaquinaCartao(scope: TenantScope, id: string, input: MaquinaCartaoInput) {
  const existente = await prisma.maquinaCartao.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!existente) throw new PaymentConfigError("Máquina de cartão não encontrada.");
  const m = await prisma.maquinaCartao.update({
    where: { id },
    data: {
      ...(input.nome !== undefined ? { nome: required(input.nome, "Nome da máquina") } : {}),
      ...(input.adquirente !== undefined ? { adquirente: clean(input.adquirente) || null } : {}),
      ...(input.contaBancariaId !== undefined ? { contaBancariaId: clean(input.contaBancariaId) || null } : {}),
      ...(input.taxaDebito !== undefined ? { taxaDebito: num(input.taxaDebito) } : {}),
      ...(input.taxaCredito !== undefined ? { taxaCredito: num(input.taxaCredito) } : {}),
      ...(input.taxaCreditoParcelado !== undefined ? { taxaCreditoParcelado: num(input.taxaCreditoParcelado) } : {}),
      ...(input.prazoDebitoDias !== undefined ? { prazoDebitoDias: int(input.prazoDebitoDias, 1) } : {}),
      ...(input.prazoCreditoDias !== undefined ? { prazoCreditoDias: int(input.prazoCreditoDias, 30) } : {}),
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {})
    }
  });
  await createAuditLog(prisma, { scope, entidade: "MaquinaCartao", entidadeId: m.id, acao: "UPDATE", payload: { nome: m.nome } });
  return m;
}

export async function archiveMaquinaCartao(scope: TenantScope, id: string) {
  const existente = await prisma.maquinaCartao.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!existente) throw new PaymentConfigError("Máquina de cartão não encontrada.");
  const m = await prisma.maquinaCartao.update({ where: { id }, data: { ativo: false } });
  await createAuditLog(prisma, { scope, entidade: "MaquinaCartao", entidadeId: id, acao: "ARCHIVE", payload: { nome: m.nome } });
  return m;
}

/** Formas de pagamento padrão dadas a todo cliente novo (editáveis/excluíveis pelo cliente). */
export const FORMAS_PAGAMENTO_PADRAO: Array<{ nome: string; tipo: string; ordem: number }> = [
  { nome: "Dinheiro", tipo: "DINHEIRO", ordem: 1 },
  { nome: "Pix", tipo: "PIX", ordem: 2 },
  { nome: "Cartão de débito", tipo: "CARTAO_DEBITO", ordem: 3 },
  { nome: "Cartão de crédito", tipo: "CARTAO_CREDITO", ordem: 4 },
  { nome: "Boleto", tipo: "BOLETO", ordem: 5 },
  { nome: "Transferência", tipo: "TRANSFERENCIA", ordem: 6 }
];

/** Semeia as formas padrão na empresa (idempotente: não duplica por nome). */
export async function seedFormasPagamentoPadrao(scope: TenantScope): Promise<number> {
  const res = await prisma.formaPagamento.createMany({
    data: FORMAS_PAGAMENTO_PADRAO.map((f) => ({ tenantId: scope.tenantId, empresaId: scope.empresaId, nome: f.nome, tipo: f.tipo, ordem: f.ordem, ativo: true })),
    skipDuplicates: true
  });
  return res.count;
}
