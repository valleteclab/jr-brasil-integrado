import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { carregarCertificado } from "@/domains/fiscal/application/certificado-use-cases";
import { encryptSecret, decryptSecret } from "@/lib/security/secret-crypto";
import { type SicoobAuth } from "@/domains/finance/providers/sicoob-cobranca";
import { getBankProvider, contaTemBoleto } from "@/domains/finance/providers/bank-registry";
import { BankError } from "@/domains/finance/providers/bank-provider";
import { randomBytes } from "node:crypto";
import { settleReceivable } from "@/domains/finance/application/finance-use-cases";
import { classificacaoReceitaPadraoId } from "@/domains/finance/application/classificacao-use-cases";
import { gerarParcelas, rotuloParcela, type ParcelaGerada } from "@/lib/finance/condicao-pagamento";

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

export type ContaCobranca = NonNullable<Awaited<ReturnType<typeof prisma.contaBancaria.findFirst>>>;

/** A conta tem cobrança (boleto) do seu banco configurada? (multibanco — delega ao registry). */
export function contaTemCobranca(conta: ContaCobranca): boolean {
  return contaTemBoleto(conta);
}

/**
 * Auth SICOOB da conta (usada só por diagnósticos Sicoob — a rota /api/cron/sicoob-teste). O fluxo
 * de cobrança/Pix/extrato usa `getBankProvider` (multibanco). Guard específico dos campos sicoob*.
 */
export async function authDaConta(scope: TenantScope, conta: ContaCobranca): Promise<SicoobAuth> {
  if (!(conta.sicoobNumeroCliente && (conta.sicoobSandbox ? conta.sicoobSandboxToken : conta.sicoobClientId))) {
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
  /** Webhook de liquidação já cadastrado no Sicoob (baixa em tempo real). */
  temWebhook: boolean;
};

/** Config de cobrança por conta (sem expor o token) — para a tela de Configurações. */
export async function listConfigCobranca(scope: TenantScope): Promise<ConfigCobrancaConta[]> {
  const contas = await prisma.contaBancaria.findMany({
    where: { ...scopedByTenantCompany(scope), ativo: true },
    orderBy: { nome: "asc" },
    select: {
      id: true, nome: true, sicoobClientId: true, sicoobNumeroCliente: true,
      sicoobContaCorrente: true, sicoobModalidade: true, sicoobSandbox: true, sicoobSandboxToken: true,
      sicoobWebhookId: true
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
    configurada: Boolean(c.sicoobNumeroCliente && (c.sicoobSandbox ? c.sicoobSandboxToken : c.sicoobClientId)),
    temWebhook: Boolean(c.sicoobWebhookId)
  }));
}

/** Contas bancárias com cobrança (boleto) habilitada — qualquer banco (para a UI mostrar "Gerar boleto"). */
export async function listContasComCobranca(scope: TenantScope): Promise<Array<{ id: string; nome: string }>> {
  const contas = await prisma.contaBancaria.findMany({
    where: { ...scopedByTenantCompany(scope), ativo: true }
  });
  return contas.filter((c) => contaTemBoleto(c)).map((c) => ({ id: c.id, nome: c.nome }));
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
  const provider = await getBankProvider(scope, conta);

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
    const resultado = await provider.incluirBoleto({
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
      mensagens: [`Referente a: ${titulo.descricao}`.slice(0, 80)]
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
    throw error instanceof BankError ? new BoletoError(message) : error;
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
  const provider = await getBankProvider(scope, boleto.contaBancaria);

  const consulta = await provider.consultarBoleto(boleto.nossoNumero);

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

/**
 * Gera boletos para TODAS as parcelas em aberto de um pedido de venda (venda parcelada no boleto:
 * cada parcela vira um boleto). Best-effort: falhas em uma parcela não impedem as demais — o
 * botão "Gerar boleto" no financeiro cobre a retentativa. Usa a primeira conta com cobrança ativa.
 */
export async function gerarBoletosDoPedido(
  scope: TenantScope,
  pedidoVendaId: string,
  opts?: { contaBancariaId?: string | null; usuarioId?: string }
): Promise<{ gerados: number; erros: string[] }> {
  const contas = await listContasComCobranca(scope);
  if (!contas.length) return { gerados: 0, erros: ["Nenhuma conta bancária com cobrança Sicoob configurada."] };
  // Conta escolhida na venda (quando houver); senão a primeira com cobrança ativa.
  const conta = (opts?.contaBancariaId && contas.find((c) => c.id === opts.contaBancariaId)) || contas[0];
  const titulos = await prisma.contaReceber.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      pedidoVendaId,
      status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] },
      boleto: null
    },
    orderBy: { vencimento: "asc" },
    select: { id: true, descricao: true }
  });
  let gerados = 0;
  const erros: string[] = [];
  for (const t of titulos) {
    try {
      await gerarBoletoParaRecebivel(scope, t.id, { contaBancariaId: conta.id }, opts?.usuarioId);
      gerados++;
    } catch (e) {
      erros.push(`${t.descricao}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { gerados, erros };
}

/**
 * CRON: consulta no Sicoob todos os boletos REGISTRADOS cujo título segue em aberto e sincroniza —
 * boleto liquidado no banco vira baixa automática do título COM crédito na conta bancária (o
 * `sincronizarBoleto` usa a settleReceivable: atualiza saldo e cria o MovimentoFinanceiro na data
 * do pagamento). Roda para todas as empresas; o ambiente vem do próprio título.
 */
export async function sincronizarBoletosCron(): Promise<{
  pendentes: number;
  baixados: number;
  erros: string[];
}> {
  const pendentes = await prisma.boletoCobranca.findMany({
    where: {
      status: "REGISTRADO",
      nossoNumero: { not: null },
      contaReceber: { status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } }
    },
    orderBy: { criadoEm: "asc" },
    take: 200,
    select: {
      contaReceberId: true,
      tenantId: true,
      empresaId: true,
      contaReceber: { select: { ambiente: true, descricao: true } }
    }
  });

  let baixados = 0;
  const erros: string[] = [];
  for (const b of pendentes) {
    const scope = { tenantId: b.tenantId, empresaId: b.empresaId, ambiente: b.contaReceber.ambiente } as TenantScope;
    try {
      const r = await sincronizarBoleto(scope, b.contaReceberId);
      if (r.baixado) baixados++;
    } catch (e) {
      erros.push(`${b.contaReceber.descricao}: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Intervalo suave entre consultas (evita throttling da API).
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return { pendentes: pendentes.length, baixados, erros };
}

export type VendaBoletoResultado = {
  valor: number;
  parcelas: number;
  boletosGerados: number;
  primeiroVencimento: string;
  aviso: string | null;
  /** Títulos criados (para imprimir os boletos direto do resultado da venda). */
  titulos: Array<{ contaReceberId: string; vencimento: string; valor: number; linhaDigitavel: string | null; temPdf: boolean }>;
};

/** Divide o valor em N parcelas iguais (resíduo do arredondamento na última). */
function dividirValor(valor: number, n: number): number[] {
  const base = Math.floor((valor / n) * 100) / 100;
  const out: number[] = [];
  let acumulado = 0;
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? Math.round((valor - acumulado) * 100) / 100 : base;
    acumulado = Math.round((acumulado + v) * 100) / 100;
    out.push(v);
  }
  return out;
}

/** Parcelas customizadas do boleto: N parcelas MENSAIS iguais a partir do 1º vencimento escolhido. */
function parcelasBoletoCustom(valor: number, quantidade: number, primeiroVencimento: Date): ParcelaGerada[] {
  const total = Math.max(1, Math.min(60, Math.floor(quantidade)));
  const valores = dividirValor(valor, total);
  return valores.map((v, i) => {
    const vencimento = new Date(primeiroVencimento);
    vencimento.setMonth(vencimento.getMonth() + i);
    return { numero: i + 1, totalParcelas: total, vencimento, valor: v };
  });
}

/**
 * Parcelas com DATAS (e opcionalmente VALORES) escolhidos um a um pelo operador. Sem valores,
 * divide igualmente (resíduo na última); com valores, valida que a soma fecha com o total.
 */
export function parcelasBoletoPorDatas(valor: number, datas: Date[], valoresEscolhidos?: number[] | null): ParcelaGerada[] {
  const limitadas = datas.slice(0, 60);
  const usarEscolhidos =
    valoresEscolhidos?.length === limitadas.length && valoresEscolhidos.every((v) => Number(v) > 0);
  if (usarEscolhidos) {
    const soma = Math.round(valoresEscolhidos!.reduce((s, v) => s + Number(v), 0) * 100) / 100;
    if (Math.abs(soma - valor) > 0.02) {
      throw new BoletoError(
        `A soma das parcelas do boleto (R$ ${soma.toFixed(2)}) difere do valor da venda no boleto (R$ ${valor.toFixed(2)}). Ajuste os valores.`
      );
    }
  }
  // Mantém o PAR data↔valor escolhido pelo operador ao ordenar por vencimento.
  const pares = limitadas
    .map((vencimento, i) => ({ vencimento, valorEscolhido: usarEscolhidos ? Number(valoresEscolhidos![i]) : null }))
    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());
  const padrao = dividirValor(valor, pares.length);
  return pares.map((p, i) => ({
    numero: i + 1,
    totalParcelas: pares.length,
    vencimento: p.vencimento,
    valor: p.valorEscolhido ?? padrao[i]
  }));
}

/**
 * Venda A PRAZO no BOLETO (compartilhado por PDV e caixa): cria as parcelas no contas a receber
 * (classificadas como Receita de vendas, vinculadas ao pedido) e registra o boleto Sicoob de cada
 * uma. Best-effort na emissão: falha vira `aviso` (as parcelas ficam com o botão "Gerar boleto").
 */
export async function processarVendaBoleto(
  scope: TenantScope,
  input: {
    clienteId: string;
    pedidoVendaId: string | null;
    numero: string | null;
    valor: number;
    condicao?: string | null;
    descricaoBase: string;
    /** Escolhas do operador na venda: conta de cobrança, nº de parcelas, datas e valores por parcela. */
    opcoes?: { contaBancariaId?: string | null; parcelas?: number | null; primeiroVencimento?: Date | null; datas?: Date[] | null; valores?: number[] | null } | null;
  }
): Promise<VendaBoletoResultado> {
  // Parcelas, por prioridade: DATAS escolhidas uma a uma > N mensais a partir do 1º vencimento >
  // condição de pagamento da venda ("30/60/90"...), com fallback 1x em 30 dias.
  const datasEscolhidas = (input.opcoes?.datas ?? []).filter((d) => !Number.isNaN(d.getTime()));
  const primeiroVenc = input.opcoes?.primeiroVencimento ?? null;
  const qtdParcelas = input.opcoes?.parcelas ?? null;
  const parcelas = datasEscolhidas.length
    ? parcelasBoletoPorDatas(input.valor, datasEscolhidas, input.opcoes?.valores)
    : qtdParcelas || primeiroVenc
      ? parcelasBoletoCustom(
          input.valor,
          qtdParcelas ?? 1,
          primeiroVenc ?? new Date(Date.now() + 30 * 86400000)
        )
      : gerarParcelas(input.valor, input.condicao ?? "30");
  const contaReceberIds: Array<{ id: string; vencimento: Date; valor: number }> = [];
  await prisma.$transaction(async (tx) => {
    const classificacaoReceita = await classificacaoReceitaPadraoId(tx, scope, "vendas");
    for (const parcela of parcelas) {
      const cr = await tx.contaReceber.create({
        data: {
          ...scopedByTenantCompanyAmbiente(scope),
          clienteId: input.clienteId,
          pedidoVendaId: input.pedidoVendaId,
          classificacaoId: classificacaoReceita,
          descricao: `${input.descricaoBase} boleto${rotuloParcela(parcela)}`,
          numeroDocumento: input.numero,
          origem: "VENDA",
          formaPagamento: "BOLETO",
          vencimento: parcela.vencimento,
          valor: parcela.valor,
          valorPago: 0,
          juros: 0,
          multa: 0,
          descontoBaixa: 0,
          status: "ABERTO"
        },
        select: { id: true }
      });
      contaReceberIds.push({ id: cr.id, vencimento: parcela.vencimento, valor: parcela.valor });
    }
    await createAuditLog(tx, {
      scope,
      entidade: "PedidoVenda",
      entidadeId: input.pedidoVendaId ?? "VENDA",
      acao: "BOLETO_VENDA",
      payload: { clienteId: input.clienteId, valor: input.valor, parcelas: parcelas.length, condicao: input.condicao ?? "30" }
    });
  });

  let boletosGerados = 0;
  let aviso: string | null = null;
  const titulos: VendaBoletoResultado["titulos"] = [];
  const contasCobranca = await listContasComCobranca(scope);
  const contaEscolhida = input.opcoes?.contaBancariaId
    ? contasCobranca.find((c) => c.id === input.opcoes?.contaBancariaId) ?? contasCobranca[0]
    : contasCobranca[0];
  if (!contaEscolhida) {
    aviso = 'Nenhuma conta bancária com cobrança Sicoob configurada — as parcelas ficaram no contas a receber sem boleto (configure em Configurações → Contas financeiras e use "Gerar boleto").';
    for (const c of contaReceberIds) titulos.push({ contaReceberId: c.id, vencimento: c.vencimento.toISOString(), valor: c.valor, linhaDigitavel: null, temPdf: false });
  } else {
    const erros: string[] = [];
    for (const c of contaReceberIds) {
      try {
        const b = await gerarBoletoParaRecebivel(scope, c.id, { contaBancariaId: contaEscolhida.id });
        boletosGerados++;
        titulos.push({ contaReceberId: c.id, vencimento: c.vencimento.toISOString(), valor: c.valor, linhaDigitavel: b.linhaDigitavel, temPdf: Boolean(b.pdfBase64) });
      } catch (e) {
        erros.push(e instanceof Error ? e.message : String(e));
        titulos.push({ contaReceberId: c.id, vencimento: c.vencimento.toISOString(), valor: c.valor, linhaDigitavel: null, temPdf: false });
      }
    }
    if (erros.length) aviso = `Boleto(s) não registrados: ${[...new Set(erros)].join("; ")}. As parcelas estão no contas a receber — corrija e use "Gerar boleto".`;
  }
  return {
    valor: input.valor,
    parcelas: parcelas.length,
    boletosGerados,
    primeiroVencimento: parcelas[0].vencimento.toISOString(),
    aviso,
    titulos
  };
}

/**
 * BAIXA (cancela) o boleto NO BANCO — ele deixa de ser pagável. Use ao cancelar/renegociar o
 * título no ERP, para o boleto não ficar órfão cobrável no Sicoob. O título em si não é alterado.
 */
export async function baixarBoletoNoBanco(scope: TenantScope, contaReceberId: string, usuarioId?: string) {
  const boleto = await prisma.boletoCobranca.findFirst({
    where: { contaReceberId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: { contaBancaria: true }
  });
  if (!boleto) throw new BoletoError("Este título não tem boleto emitido.");
  if (!boleto.nossoNumero) throw new BoletoError("Boleto sem nosso número (registro não confirmado).");
  if (boleto.status === "LIQUIDADO") throw new BoletoError("O boleto já foi liquidado no banco — não pode ser baixado.");
  if (boleto.status === "BAIXADO") return boleto;
  const provider = await getBankProvider(scope, boleto.contaBancaria);
  try {
    await provider.baixarBoleto(boleto.nossoNumero);
  } catch (e) {
    // 5002 "Boleto em processo de baixa/liquidação": o banco JÁ está baixando (baixa anterior em
    // processamento) — idempotente: considera cancelado e alinha o status local.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/5002|processo de baixa/i.test(msg)) throw e;
  }
  const atualizado = await prisma.boletoCobranca.update({ where: { id: boleto.id }, data: { status: "BAIXADO" } });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId, entidade: "BoletoCobranca", entidadeId: boleto.id, acao: "BAIXA_BANCO",
    payload: { contaReceberId, nossoNumero: boleto.nossoNumero }
  }));
  return atualizado;
}

/**
 * CASCATA de cancelamento: pedido de venda cancelado → cancela NO BANCO os boletos registrados
 * das parcelas (baixa no Sicoob) e marca as cobranças Pix ativas do pedido como removidas (o QR
 * expira sozinho no banco). Best-effort: falha em um boleto não impede os demais — os erros voltam
 * para quem chamou avisar o operador (o boleto segue com "Cancelar boleto" manual no financeiro).
 */
export async function cancelarCobrancasDoPedido(
  scope: TenantScope,
  pedidoVendaId: string,
  usuarioId?: string
): Promise<{ boletosCancelados: number; erros: string[] }> {
  const boletos = await prisma.boletoCobranca.findMany({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      status: "REGISTRADO",
      contaReceber: { pedidoVendaId }
    },
    select: { contaReceberId: true, contaReceber: { select: { descricao: true } } }
  });
  let cancelados = 0;
  const erros: string[] = [];
  for (const b of boletos) {
    try {
      await baixarBoletoNoBanco(scope, b.contaReceberId, usuarioId);
      cancelados++;
    } catch (e) {
      erros.push(`${b.contaReceber.descricao}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await prisma.pixCobranca.updateMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, pedidoVendaId, status: "ATIVA" },
    data: { status: "REMOVIDA" }
  });
  return { boletosCancelados: cancelados, erros };
}

/**
 * PRORROGA o vencimento do boleto no banco e ajusta o vencimento do título/registro no ERP.
 * (Prorrogação só anda para frente: o Sicoob não aceita antecipar a data.)
 */
export async function prorrogarBoletoNoBanco(scope: TenantScope, contaReceberId: string, novaData: Date, usuarioId?: string) {
  if (Number.isNaN(novaData.getTime())) throw new BoletoError("Data de vencimento inválida.");
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  if (novaData < hoje) throw new BoletoError("O novo vencimento não pode ficar no passado.");
  const boleto = await prisma.boletoCobranca.findFirst({
    where: { contaReceberId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: { contaBancaria: true }
  });
  if (!boleto) throw new BoletoError("Este título não tem boleto emitido.");
  if (!boleto.nossoNumero) throw new BoletoError("Boleto sem nosso número (registro não confirmado).");
  if (boleto.status !== "REGISTRADO") throw new BoletoError(`O boleto não está em aberto no banco (${boleto.status}).`);
  if (novaData <= boleto.vencimento) {
    throw new BoletoError("A prorrogação só pode ADIAR o vencimento (o Sicoob não aceita antecipar). Para outra data, baixe o boleto e emita um novo.");
  }
  const provider = await getBankProvider(scope, boleto.contaBancaria);
  await provider.prorrogarBoleto(boleto.nossoNumero, DATE_ISO(novaData));
  await prisma.boletoCobranca.update({ where: { id: boleto.id }, data: { vencimento: novaData } });
  await prisma.contaReceber.update({ where: { id: contaReceberId }, data: { vencimento: novaData } });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId, entidade: "BoletoCobranca", entidadeId: boleto.id, acao: "PRORROGACAO",
    payload: { contaReceberId, nossoNumero: boleto.nossoNumero, novaData: DATE_ISO(novaData) }
  }));
  return { vencimento: novaData };
}

/**
 * ATIVA o webhook de liquidação da cobrança para uma conta: o Sicoob passa a chamar o ERP quando
 * um boleto é pago (baixa em tempo real, sem esperar o cron). A URL pública carrega um segredo
 * aleatório por conta — e o receiver NUNCA confia no corpo: sempre re-consulta a API antes de baixar.
 */
export async function ativarWebhookCobranca(scope: TenantScope, contaBancariaId: string, usuarioId?: string) {
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaBancariaId, ...scopedByTenantCompany(scope), ativo: true } });
  if (!conta) throw new BoletoError("Conta bancária não encontrada.");
  const provider = await getBankProvider(scope, conta);
  const baseUrl = (process.env.ERP_BASE ?? process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//.test(baseUrl)) {
    throw new BoletoError("Defina ERP_BASE (https, endereço público do ERP) no ambiente para ativar o webhook — o Sicoob precisa alcançar o servidor.");
  }
  const empresa = await prisma.empresa.findFirst({ where: { id: scope.empresaId }, select: { email: true } });
  const email = empresa?.email?.trim();
  if (!email) throw new BoletoError("Cadastre o e-mail da empresa (Configurações → Empresa) — o Sicoob exige um e-mail de contato no webhook.");
  const secret = conta.sicoobWebhookSecret ?? randomBytes(24).toString("hex");
  const url = `${baseUrl}/api/webhooks/sicoob/cobranca/${secret}`;
  const idWebhook = await provider.cadastrarWebhookCobranca(url, email);
  await prisma.contaBancaria.update({ where: { id: conta.id }, data: { sicoobWebhookId: idWebhook, sicoobWebhookSecret: secret } });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId, entidade: "ContaBancaria", entidadeId: conta.id, acao: "WEBHOOK_COBRANCA", payload: { idWebhook, url }
  }));
  return { idWebhook, url };
}

/** Situação do webhook no Sicoob (3 = validado com sucesso) — para a tela de Configurações. */
export async function statusWebhookCobranca(scope: TenantScope, contaBancariaId: string) {
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaBancariaId, ...scopedByTenantCompany(scope) } });
  if (!conta) throw new BoletoError("Conta bancária não encontrada.");
  if (!conta.sicoobWebhookId) return { ativo: false, situacao: null as string | null };
  const provider = await getBankProvider(scope, conta);
  const lista = await provider.consultarWebhooksCobranca();
  const meu = lista.find((w) => w.idWebhook === conta.sicoobWebhookId) ?? null;
  return { ativo: Boolean(meu), situacao: meu?.descricaoSituacao ?? null };
}

/**
 * Processa uma chamada do WEBHOOK (rota pública): identifica a conta pelo segredo da URL, extrai
 * os nossos números citados no corpo (defensivo — qualquer formato) e re-consulta cada boleto na
 * API antes de baixar. Corpo sem nosso número identificável → sincroniza os pendentes da conta.
 */
export async function processarWebhookCobranca(secret: string, payload: unknown): Promise<{ processados: number; baixados: number }> {
  const conta = await prisma.contaBancaria.findFirst({ where: { sicoobWebhookSecret: secret, ativo: true } });
  if (!conta) throw new BoletoError("Webhook desconhecido.");

  const nossoNumeros = new Set<string>();
  (function coletar(v: unknown, profundidade = 0): void {
    if (profundidade > 6 || v == null) return;
    if (Array.isArray(v)) { v.slice(0, 200).forEach((x) => coletar(x, profundidade + 1)); return; }
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (/nossonumero/i.test(k) && (typeof val === "string" || typeof val === "number")) nossoNumeros.add(String(val));
        else coletar(val, profundidade + 1);
      }
    }
  })(payload);

  const boletos = await prisma.boletoCobranca.findMany({
    where: {
      tenantId: conta.tenantId,
      empresaId: conta.empresaId,
      contaBancariaId: conta.id,
      status: "REGISTRADO",
      nossoNumero: nossoNumeros.size ? { in: [...nossoNumeros] } : { not: null },
      contaReceber: { status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } }
    },
    take: 50,
    select: { contaReceberId: true, contaReceber: { select: { ambiente: true } } }
  });

  let baixados = 0;
  for (const b of boletos) {
    const scope = { tenantId: conta.tenantId, empresaId: conta.empresaId, ambiente: b.contaReceber.ambiente } as TenantScope;
    try {
      const r = await sincronizarBoleto(scope, b.contaReceberId);
      if (r.baixado) baixados++;
    } catch { /* segue os demais; o cron cobre retentativas */ }
  }
  return { processados: boletos.length, baixados };
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
