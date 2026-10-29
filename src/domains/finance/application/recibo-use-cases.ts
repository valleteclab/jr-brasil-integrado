import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { gerarReciboPdf } from "@/lib/pdf/recibo-pdf";
import { FinanceValidationError } from "./finance-use-cases";

/**
 * RECIBO DE PAGAMENTO — comprovante da despesa que não tem nota fiscal (autônomo, aluguel,
 * acordo). O recibo é EMITIDO UMA VEZ por conta a pagar e reimprime sempre igual: o número é
 * sequencial por empresa e os dados do favorecido ficam congelados no momento da emissão, porque
 * mudar o cadastro do fornecedor depois não pode reescrever um comprovante já entregue.
 */

export type ReciboResumo = {
  id: string;
  numero: number;
  favorecidoNome: string;
  favorecidoDocumento: string | null;
  valor: number;
  referente: string;
  dataPagamento: string;
  formaPagamento: string | null;
  cidade: string | null;
  observacao: string | null;
  criadoEm: string;
};

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function paraResumo(r: {
  id: string;
  numero: number;
  favorecidoNome: string;
  favorecidoDocumento: string | null;
  valor: unknown;
  referente: string;
  dataPagamento: Date;
  formaPagamento: string | null;
  cidade: string | null;
  observacao: string | null;
  criadoEm: Date;
}): ReciboResumo {
  return {
    id: r.id,
    numero: r.numero,
    favorecidoNome: r.favorecidoNome,
    favorecidoDocumento: r.favorecidoDocumento,
    valor: Number(r.valor),
    referente: r.referente,
    dataPagamento: r.dataPagamento.toISOString(),
    formaPagamento: r.formaPagamento,
    cidade: r.cidade,
    observacao: r.observacao,
    criadoEm: r.criadoEm.toISOString()
  };
}

/** Próximo número da empresa (sequencial próprio, independente de nota fiscal). */
async function proximoNumero(scope: TenantScope): Promise<number> {
  const ultimo = await prisma.reciboPagamento.findFirst({
    where: scopedByTenantCompany(scope),
    orderBy: { numero: "desc" },
    select: { numero: true }
  });
  return (ultimo?.numero ?? 0) + 1;
}

export async function reciboDaConta(scope: TenantScope, contaPagarId: string): Promise<ReciboResumo | null> {
  const r = await prisma.reciboPagamento.findFirst({
    where: { ...scopedByTenantCompany(scope), contaPagarId },
    orderBy: { criadoEm: "desc" }
  });
  return r ? paraResumo(r) : null;
}

/**
 * Emite (ou devolve, se já existir) o recibo de uma conta a pagar. Os campos aceitam ajuste —
 * quem recebeu nem sempre é o fornecedor cadastrado, e o "referente a" costuma precisar de uma
 * frase melhor do que a descrição interna do título.
 */
export async function emitirRecibo(
  scope: TenantScope,
  input: {
    contaPagarId: string;
    favorecidoNome?: string;
    favorecidoDocumento?: string | null;
    referente?: string;
    dataPagamento?: string | Date;
    formaPagamento?: string | null;
    cidade?: string | null;
    observacao?: string | null;
    valor?: number;
  },
  usuarioId?: string
): Promise<ReciboResumo> {
  const existente = await reciboDaConta(scope, input.contaPagarId);
  if (existente) return existente;

  const conta = await prisma.contaPagar.findFirst({
    where: { id: input.contaPagarId, ...scopedByTenantCompany(scope) },
    select: {
      id: true,
      descricao: true,
      valor: true,
      valorPago: true,
      vencimento: true,
      pagoEm: true,
      formaPagamento: true,
      fornecedor: { select: { razaoSocial: true, nomeFantasia: true, documento: true } }
    }
  });
  if (!conta) throw new FinanceValidationError("Conta a pagar não encontrada.");

  const favorecidoNome =
    input.favorecidoNome?.trim() ||
    conta.fornecedor?.razaoSocial ||
    conta.fornecedor?.nomeFantasia ||
    "";
  if (!favorecidoNome) {
    throw new FinanceValidationError("Informe quem recebeu o pagamento (a conta não tem fornecedor cadastrado).");
  }

  const valor = round2(input.valor != null ? Number(input.valor) : Number(conta.valorPago) > 0 ? Number(conta.valorPago) : Number(conta.valor));
  if (!Number.isFinite(valor) || valor <= 0) throw new FinanceValidationError("Valor do recibo inválido.");

  const dataPagamento = input.dataPagamento
    ? new Date(input.dataPagamento)
    : conta.pagoEm ?? conta.vencimento;
  if (Number.isNaN(dataPagamento.getTime())) throw new FinanceValidationError("Data do recibo inválida.");

  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId },
    select: { enderecoCidade: true }
  });

  const recibo = await prisma.reciboPagamento.create({
    data: {
      ...scopedByTenantCompany(scope),
      numero: await proximoNumero(scope),
      contaPagarId: conta.id,
      favorecidoNome: favorecidoNome.slice(0, 200),
      favorecidoDocumento: (input.favorecidoDocumento ?? conta.fornecedor?.documento ?? null)?.replace(/\D/g, "") || null,
      valor,
      referente: (input.referente?.trim() || conta.descricao).slice(0, 2000),
      dataPagamento,
      formaPagamento: input.formaPagamento?.trim() || conta.formaPagamento || null,
      cidade: input.cidade?.trim() || empresa?.enderecoCidade || null,
      observacao: input.observacao?.trim() || null,
      usuarioId: usuarioId ?? null
    }
  });

  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ReciboPagamento",
      entidadeId: recibo.id,
      acao: "RECIBO_EMITIDO",
      payload: { numero: recibo.numero, contaPagarId: conta.id, valor, favorecido: favorecidoNome }
    })
  );

  return paraResumo(recibo);
}

/** PDF do recibo (duas vias), montado com os dados congelados na emissão. */
export async function pdfDoRecibo(scope: TenantScope, reciboId: string): Promise<{ pdf: Buffer; nomeArquivo: string }> {
  const recibo = await prisma.reciboPagamento.findFirst({ where: { id: reciboId, ...scopedByTenantCompany(scope) } });
  if (!recibo) throw new FinanceValidationError("Recibo não encontrado.");

  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId },
    select: {
      razaoSocial: true,
      cnpj: true,
      enderecoLogradouro: true,
      enderecoNumero: true,
      enderecoBairro: true,
      enderecoCidade: true,
      enderecoUf: true,
      logoSistema: true
    }
  });

  const endereco = [
    [empresa?.enderecoLogradouro, empresa?.enderecoNumero].filter(Boolean).join(", "),
    empresa?.enderecoBairro,
    [empresa?.enderecoCidade, empresa?.enderecoUf].filter(Boolean).join("/")
  ]
    .filter(Boolean)
    .join(" - ");

  const pdf = await gerarReciboPdf({
    numero: recibo.numero,
    empresa: {
      razaoSocial: empresa?.razaoSocial ?? "",
      cnpj: empresa?.cnpj ?? null,
      endereco: endereco || null,
      logoDataUrl: empresa?.logoSistema ?? null
    },
    favorecido: { nome: recibo.favorecidoNome, documento: recibo.favorecidoDocumento },
    valor: Number(recibo.valor),
    referente: recibo.referente,
    dataPagamento: recibo.dataPagamento,
    formaPagamento: recibo.formaPagamento,
    cidade: recibo.cidade,
    observacao: recibo.observacao
  });

  return { pdf, nomeArquivo: `recibo-${String(recibo.numero).padStart(5, "0")}.pdf` };
}
