import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { carregarCertificado } from "@/domains/fiscal/application/certificado-use-cases";
import { encryptSecret, decryptSecret } from "@/lib/security/secret-crypto";
import { incluirBoleto, consultarBoleto as consultarBoletoSicoob, SicoobError, type SicoobAuth } from "@/domains/finance/providers/sicoob-cobranca";
import { settleReceivable } from "@/domains/finance/application/finance-use-cases";

/**
 * EMISSÃO DE BOLETO (Sicoob) a partir de uma ContaReceber: registra o boleto na API de Cobrança,
 * guarda nosso número/linha digitável/PDF, e a consulta de situação BAIXA o título automaticamente
 * quando o boleto liquida no banco (crédito na conta de cobrança).
 */

export class BoletoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoletoError";
  }
}

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D+/g, "");
}

/** Config Sicoob da conta bancária (client_id, nº do cliente/beneficiário, sandbox). */
export async function configurarSicoob(
  scope: TenantScope,
  contaBancariaId: string,
  input: {
    sicoobClientId?: string | null;
    sicoobNumeroCliente?: number | null;
    sicoobContaCorrente?: string | null;
    sicoobModalidade?: number;
    sicoobSandbox?: boolean;
    sicoobSandboxToken?: string | null;
  }
) {
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaBancariaId, ...scopedByTenantCompany(scope) } });
  if (!conta) throw new BoletoError("Conta bancária não encontrada.");
  return prisma.contaBancaria.update({
    where: { id: contaBancariaId },
    data: {
      ...(input.sicoobClientId !== undefined ? { sicoobClientId: input.sicoobClientId?.trim() || null } : {}),
      ...(input.sicoobNumeroCliente !== undefined ? { sicoobNumeroCliente: input.sicoobNumeroCliente || null } : {}),
      ...(input.sicoobContaCorrente !== undefined ? { sicoobContaCorrente: input.sicoobContaCorrente?.trim() || null } : {}),
      ...(input.sicoobModalidade !== undefined ? { sicoobModalidade: input.sicoobModalidade || 1 } : {}),
      ...(input.sicoobSandbox !== undefined ? { sicoobSandbox: input.sicoobSandbox } : {}),
      ...(input.sicoobSandboxToken !== undefined
        ? { sicoobSandboxToken: input.sicoobSandboxToken?.trim() ? encryptSecret(input.sicoobSandboxToken.trim()) : null }
        : {})
    }
  });
}

type ContaCobranca = NonNullable<Awaited<ReturnType<typeof prisma.contaBancaria.findFirst>>>;

function contaTemCobranca(conta: ContaCobranca): boolean {
  return Boolean(conta.sicoobNumeroCliente && (conta.sicoobSandbox ? conta.sicoobSandboxToken : conta.sicoobClientId));
}

async function authDaConta(scope: TenantScope, conta: ContaCobranca): Promise<SicoobAuth> {
  if (!contaTemCobranca(conta)) {
    throw new BoletoError(
      `A conta "${conta.nome}" não está configurada para cobrança Sicoob (client_id/nº do beneficiário em Configurações → Contas financeiras).`
    );
  }
  const certificado = conta.sicoobSandbox ? null : await carregarCertificado(scope);
  if (!conta.sicoobSandbox && !certificado) {
    throw new BoletoError("Certificado A1 da empresa não cadastrado — necessário para o mTLS do Sicoob (Configurações → Fiscal).");
  }
  return {
    sandbox: conta.sicoobSandbox,
    clientId: conta.sicoobClientId,
    sandboxToken: conta.sicoobSandboxToken ? decryptSecret(conta.sicoobSandboxToken) : null,
    certificado
  };
}

export type ConfigCobrancaConta = {
  id: string;
  nome: string;
  sicoobClientId: string | null;
  sicoobNumeroCliente: number | null;
  sicoobContaCorrente: string | null;
  sicoobModalidade: number;
  sicoobSandbox: boolean;
  temSandboxToken: boolean;
  configurada: boolean;
};

/** Config de cobrança por conta (sem expor o token) — para a tela de Configurações. */
export async function listConfigCobranca(scope: TenantScope): Promise<ConfigCobrancaConta[]> {
  const contas = await prisma.contaBancaria.findMany({
    where: { ...scopedByTenantCompany(scope), ativo: true },
    orderBy: { nome: "asc" },
    select: {
      id: true, nome: true, sicoobClientId: true, sicoobNumeroCliente: true,
      sicoobContaCorrente: true, sicoobModalidade: true, sicoobSandbox: true, sicoobSandboxToken: true
    }
  });
  return contas.map((c) => ({
    id: c.id,
    nome: c.nome,
    sicoobClientId: c.sicoobClientId,
    sicoobNumeroCliente: c.sicoobNumeroCliente,
    sicoobContaCorrente: c.sicoobContaCorrente,
    sicoobModalidade: c.sicoobModalidade,
    sicoobSandbox: c.sicoobSandbox,
    temSandboxToken: Boolean(c.sicoobSandboxToken),
    configurada: Boolean(c.sicoobNumeroCliente && (c.sicoobSandbox ? c.sicoobSandboxToken : c.sicoobClientId))
  }));
}

/** Contas bancárias com cobrança Sicoob habilitada (para a UI decidir se mostra "Gerar boleto"). */
export async function listContasComCobranca(scope: TenantScope): Promise<Array<{ id: string; nome: string }>> {
  const contas = await prisma.contaBancaria.findMany({
    where: { ...scopedByTenantCompany(scope), ativo: true, sicoobNumeroCliente: { not: null } },
    select: { id: true, nome: true, sicoobSandbox: true, sicoobSandboxToken: true, sicoobClientId: true, sicoobNumeroCliente: true }
  });
  return contas
    .filter((c) => Boolean(c.sicoobSandbox ? c.sicoobSandboxToken : c.sicoobClientId))
    .map((c) => ({ id: c.id, nome: c.nome }));
}

const DATE_ISO = (d: Date) => d.toISOString().slice(0, 10);

export async function gerarBoletoParaRecebivel(
  scope: TenantScope,
  contaReceberId: string,
  input: { contaBancariaId: string },
  usuarioId?: string
) {
  const titulo = await prisma.contaReceber.findFirst({
    where: { id: contaReceberId, ...scopedByTenantCompany(scope) },
    include: {
      boleto: true,
      cliente: { include: { enderecos: { orderBy: { padrao: "desc" } }, contatos: { orderBy: { principal: "desc" } } } }
    }
  });
  if (!titulo) throw new BoletoError("Conta a receber não encontrada.");
  if (!["ABERTO", "PARCIAL", "VENCIDO"].includes(titulo.status)) {
    throw new BoletoError(`O título não está em aberto (${titulo.status}).`);
  }
  if (titulo.boleto && titulo.boleto.status !== "ERRO") {
    throw new BoletoError("Este título já tem boleto emitido. Consulte a situação ou baixe a 2ª via.");
  }

  const conta = await prisma.contaBancaria.findFirst({ where: { id: input.contaBancariaId, ...scopedByTenantCompany(scope), ativo: true } });
  if (!conta) throw new BoletoError("Conta bancária não encontrada.");
  const auth = await authDaConta(scope, conta);

  // Pagador: o registro do boleto exige CPF/CNPJ + endereço completo do cliente.
  const cliente = titulo.cliente;
  const docPagador = onlyDigits(cliente.documento);
  if (docPagador.length !== 11 && docPagador.length !== 14) {
    throw new BoletoError(`Cadastre o CPF/CNPJ do cliente "${cliente.razaoSocial}" para emitir boleto.`);
  }
  const end = cliente.enderecos[0];
  const cep = onlyDigits(end?.cep);
  if (!end || !end.logradouro?.trim() || !end.cidade?.trim() || !end.uf?.trim() || cep.length !== 8) {
    throw new BoletoError(`Cadastre o endereço completo (logradouro, cidade, UF e CEP) do cliente "${cliente.razaoSocial}" para emitir boleto.`);
  }

  const saldo = Math.round(
    (Number(titulo.valor) + Number(titulo.juros) + Number(titulo.multa) - Number(titulo.descontoBaixa) - Number(titulo.valorPago)) * 100
  ) / 100;
  if (saldo <= 0) throw new BoletoError("O título não tem saldo em aberto.");

  const seuNumero = (titulo.numeroDocumento ?? titulo.id.slice(-10)).slice(0, 10);
  const hoje = new Date();
  const vencimento = titulo.vencimento < hoje ? hoje : titulo.vencimento; // registro não aceita vencimento no passado

  const registro = await prisma.boletoCobranca.upsert({
    where: { contaReceberId: titulo.id },
    update: { status: "EMITIDO", contaBancariaId: conta.id, valor: saldo, vencimento, ultimoErro: null },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      contaReceberId: titulo.id,
      contaBancariaId: conta.id,
      valor: saldo,
      vencimento,
      seuNumero
    }
  });

  try {
    const resultado = await incluirBoleto(auth, {
      numeroCliente: conta.sicoobNumeroCliente as number,
      codigoModalidade: conta.sicoobModalidade,
      numeroContaCorrente: conta.sicoobContaCorrente ? Number(onlyDigits(conta.sicoobContaCorrente)) : undefined,
      seuNumero,
      valor: saldo,
      dataVencimento: DATE_ISO(vencimento),
      dataEmissao: DATE_ISO(hoje),
      pagador: {
        numeroCpfCnpj: docPagador,
        nome: cliente.razaoSocial.slice(0, 50),
        endereco: `${end.logradouro}${end.numero ? `, ${end.numero}` : ""}`.slice(0, 40),
        bairro: (end.bairro ?? "Centro").slice(0, 30),
        cidade: end.cidade.slice(0, 40),
        cep,
        uf: end.uf.toUpperCase().slice(0, 2),
        email: cliente.contatos[0]?.email ?? undefined
      },
      mensagensInstrucao: [`Referente a: ${titulo.descricao}`.slice(0, 80)]
    });

    const atualizado = await prisma.boletoCobranca.update({
      where: { id: registro.id },
      data: {
        status: "REGISTRADO",
        nossoNumero: resultado.nossoNumero,
        linhaDigitavel: resultado.linhaDigitavel,
        codigoBarras: resultado.codigoBarras,
        pdfBase64: resultado.pdfBase64,
        payload: resultado.bruto as object,
        ultimoErro: null
      }
    });
    await prisma.contaReceber.update({ where: { id: titulo.id }, data: { formaPagamento: "BOLETO", contaBancariaId: conta.id } });
    await prisma.$transaction(async (tx) => createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "BoletoCobranca",
      entidadeId: atualizado.id,
      acao: "CREATE",
      payload: { contaReceberId: titulo.id, nossoNumero: resultado.nossoNumero, valor: saldo }
    }));
    return atualizado;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao registrar o boleto.";
    await prisma.boletoCobranca.update({ where: { id: registro.id }, data: { status: "ERRO", ultimoErro: message } });
    throw error instanceof SicoobError ? new BoletoError(message) : error;
  }
}

/**
 * Consulta a situação do boleto no Sicoob e sincroniza: LIQUIDADO → baixa automática do título
 * (crédito na conta de cobrança, na data informada pelo banco); BAIXADO → marca baixado.
 */
export async function sincronizarBoleto(scope: TenantScope, contaReceberId: string) {
  const boleto = await prisma.boletoCobranca.findFirst({
    where: { contaReceberId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: { contaBancaria: true, contaReceber: { select: { status: true, valor: true, juros: true, multa: true, descontoBaixa: true, valorPago: true } } }
  });
  if (!boleto) throw new BoletoError("Este título não tem boleto emitido.");
  if (!boleto.nossoNumero) throw new BoletoError("Boleto sem nosso número (registro não confirmado).");
  const auth = await authDaConta(scope, boleto.contaBancaria);

  const consulta = await consultarBoletoSicoob(auth, {
    numeroCliente: boleto.contaBancaria.sicoobNumeroCliente as number,
    codigoModalidade: boleto.contaBancaria.sicoobModalidade,
    nossoNumero: boleto.nossoNumero
  });

  const situacao = (consulta.situacao ?? "").toUpperCase();
  if (situacao.includes("LIQUID")) {
    // Baixa automática (idempotente: só se o título ainda está aberto).
    if (["ABERTO", "PARCIAL", "VENCIDO"].includes(boleto.contaReceber.status)) {
      const t = boleto.contaReceber;
      const saldo = Math.round((Number(t.valor) + Number(t.juros) + Number(t.multa) - Number(t.descontoBaixa) - Number(t.valorPago)) * 100) / 100;
      await settleReceivable(scope, contaReceberId, {
        valor: consulta.valorPago && consulta.valorPago > 0 ? Math.min(consulta.valorPago, saldo) : saldo,
        formaPagamento: "BOLETO",
        contaBancariaId: boleto.contaBancariaId,
        dataPagamento: consulta.dataPagamento ? new Date(`${consulta.dataPagamento}T12:00:00`) : new Date()
      });
    }
    await prisma.boletoCobranca.update({ where: { id: boleto.id }, data: { status: "LIQUIDADO", payload: consulta.bruto as object } });
    return { status: "LIQUIDADO", baixado: true };
  }
  if (situacao.includes("BAIXA")) {
    await prisma.boletoCobranca.update({ where: { id: boleto.id }, data: { status: "BAIXADO", payload: consulta.bruto as object } });
    return { status: "BAIXADO", baixado: false };
  }
  await prisma.boletoCobranca.update({ where: { id: boleto.id }, data: { payload: consulta.bruto as object } });
  return { status: situacao || "EM ABERTO", baixado: false };
}

/** PDF do boleto (2ª via a partir do base64 guardado no registro). */
export async function pdfDoBoleto(scope: TenantScope, contaReceberId: string): Promise<Buffer> {
  const boleto = await prisma.boletoCobranca.findFirst({
    where: { contaReceberId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    select: { pdfBase64: true, linhaDigitavel: true, contaBancaria: { select: { sicoobSandbox: true } } }
  });
  if (!boleto?.pdfBase64) throw new BoletoError("PDF do boleto não disponível.");
  const pdf = Buffer.from(boleto.pdfBase64, "base64");
  // O SANDBOX do Sicoob devolve um "PDF" de exemplo truncado (~100 bytes) que não abre — não é
  // erro do sistema. Detecta e explica; em produção o PDF real vem completo.
  const valido = pdf.subarray(0, 4).toString("latin1") === "%PDF" && pdf.length > 2000;
  if (!valido) {
    const contexto = boleto.contaBancaria.sicoobSandbox
      ? "O ambiente SANDBOX do Sicoob devolve um PDF de exemplo inválido (não abre) — em produção o boleto real é retornado."
      : "O PDF retornado pelo Sicoob está incompleto.";
    throw new BoletoError(
      `${contexto}${boleto.linhaDigitavel ? ` Linha digitável do registro: ${boleto.linhaDigitavel}` : ""}`
    );
  }
  return pdf;
}
