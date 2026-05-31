import type { ModeloFiscal, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { nextFiscalNumber } from "@/lib/numbering";
import {
  accumulateTotals,
  computeItemTaxes,
  emptyTotals,
  loadSalesTaxRules
} from "../tax-engine";
import { isSubstituicaoTributaria, resolveCfopVenda } from "../cfop";
import type { NormalizedFiscalDocument } from "../types";
import { resolveFiscalProvider } from "../providers";
import type { ProviderContext } from "../providers/types";
import { getFiscalRuntimeConfig } from "./fiscal-config-use-cases";

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function isIbgeMunicipio(value: string | null | undefined): boolean {
  return /^\d{7}$/.test(onlyDigits(value));
}

function isValidCnpj(value: string | null | undefined): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (base: string, weights: number[]) => {
    const sum = weights.reduce((acc, weight, index) => acc + Number(base[index]) * weight, 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calc(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

function validateBeforeProvider(
  config: Awaited<ReturnType<typeof getFiscalRuntimeConfig>>,
  document: NormalizedFiscalDocument
) {
  if (document.modelo !== "NFE" && document.modelo !== "NFCE") return;

  const issues: string[] = [];
  if (!isValidCnpj(config.emitter.cnpj)) {
    issues.push("CNPJ do emitente inválido. Atualize a empresa no onboarding fiscal com um CNPJ real do certificado.");
  }
  if (!isIbgeMunicipio(config.emitter.codigoMunicipioIbge)) {
    issues.push("Código IBGE do município do emitente ausente ou inválido (7 dígitos). Preencha em Configurações > Emissão fiscal ou no onboarding fiscal.");
  }

  const endereco = document.destinatario.endereco;
  if (document.modelo === "NFE") {
    if (!endereco) {
      issues.push("Endereço do destinatário é obrigatório para NF-e.");
    } else if (!isIbgeMunicipio(endereco.codigoMunicipioIbge)) {
      issues.push("Código IBGE do município do destinatário ausente ou inválido (7 dígitos). Atualize o endereço do cliente ou use a busca por CEP/CNPJ.");
    }
  }

  if (issues.length) {
    throw new Error(`Não foi possível emitir a nota fiscal: ${issues.join(" ")}`);
  }
}

export type FiscalDocumentLinks = {
  clienteId?: string | null;
  pedidoVendaId?: string | null;
  ordemServicoId?: string | null;
  usuarioId?: string | null;
};

/**
 * Emite um documento fiscal de saída (NF-e/NFC-e/NFS-e) a partir de um documento
 * normalizado. Orquestra: configuração/emitente, cálculo de tributos por item, numeração
 * atômica por série, persistência (PROCESSANDO → AUTORIZADA/REJEITADA), chamada ao provedor
 * e registro de eventos/auditoria. A baixa de estoque e o contas a receber são de
 * responsabilidade do fluxo de origem (venda/OS), que chama esta função e reage ao retorno.
 */
export async function emitFiscalDocument(
  scope: TenantScope,
  document: NormalizedFiscalDocument,
  links: FiscalDocumentLinks = {}
) {
  if (!document.itens.length) {
    throw new Error("Documento fiscal sem itens.");
  }

  const config = await getFiscalRuntimeConfig(scope);
  validateBeforeProvider(config, document);
  const modelo: ModeloFiscal = document.modelo;
  const serie =
    document.serie ||
    (modelo === "NFE" ? config.serieNfe : modelo === "NFCE" ? config.serieNfce : config.serieNfse);

  const rules = await loadSalesTaxRules(prisma, scope);
  const totals = emptyTotals();
  const computedItems = document.itens.map((item, index) => {
    const taxes = computeItemTaxes(item, rules, {
      regime: config.regime,
      ufOrigem: config.emitter.uf,
      ufDestino: document.destinatario.uf,
      servico: item.servico
    });
    // CFOP automático para mercadorias: respeita CFOP explícito do item; senão deriva de
    // origem/destino e da existência de substituição tributária nos tributos calculados.
    const cfop = item.servico
      ? null
      : item.cfop ??
        resolveCfopVenda({
          ufOrigem: config.emitter.uf,
          ufDestino: document.destinatario.uf,
          substituicaoTributaria: isSubstituicaoTributaria(taxes)
        });
    accumulateTotals(totals, item, taxes);
    return { item, taxes, cfop, numeroItem: index + 1 };
  });

  const baseValor = round2(totals.valorProdutos + totals.valorServicos);
  const total = round2(
    baseValor -
      document.valorDesconto +
      document.valorFrete +
      document.valorSeguro +
      document.outrasDespesas +
      totals.valorIcmsSt +
      totals.valorIpi
  );

  // IBPT / Lei 12.741: informa o valor aproximado dos tributos no documento.
  const ibptText = `Valor aproximado dos tributos: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totals.valorTotalTributos)} (Lei 12.741/2012).`;
  const informacoesComplementares = [document.informacoesComplementares, ibptText]
    .filter((part) => part && part.trim())
    .join(" ");

  // 1) Persiste a nota em PROCESSANDO com itens e tributos calculados (numeração atômica).
  const created = await prisma.$transaction(async (tx) => {
    const numero = await nextFiscalNumber(tx, scope, modelo, serie);
    const nota = await tx.notaFiscal.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        modelo,
        finalidade: document.finalidade,
        ambiente: config.ambiente,
        provedor: config.provider,
        numero: String(numero),
        serie,
        status: "PROCESSANDO",
        naturezaOperacao: document.naturezaOperacao,
        clienteId: links.clienteId ?? null,
        pedidoVendaId: links.pedidoVendaId ?? null,
        ordemServicoId: links.ordemServicoId ?? null,
        destinatarioNome: document.destinatario.nome,
        destinatarioDocumento: document.destinatario.documento,
        destinatarioIe: document.destinatario.inscricaoEstadual,
        destinatarioEmail: document.destinatario.email,
        valorProdutos: totals.valorProdutos,
        valorServicos: totals.valorServicos,
        valorDesconto: document.valorDesconto || totals.valorDesconto,
        valorFrete: document.valorFrete,
        valorSeguro: document.valorSeguro,
        outrasDespesas: document.outrasDespesas,
        valorIcms: totals.valorIcms,
        valorIcmsSt: totals.valorIcmsSt,
        valorFcp: totals.valorFcp,
        valorIpi: totals.valorIpi,
        valorPis: totals.valorPis,
        valorCofins: totals.valorCofins,
        valorIss: totals.valorIss,
        valorTotalTributos: totals.valorTotalTributos,
        issRetido: document.retencoes?.issRetido ?? false,
        valorIrRetido: document.retencoes?.ir?.valor ?? 0,
        valorPisRetido: document.retencoes?.pis?.valor ?? 0,
        valorCofinsRetido: document.retencoes?.cofins?.valor ?? 0,
        valorCsllRetido: document.retencoes?.csll?.valor ?? 0,
        valorInssRetido: document.retencoes?.inss?.valor ?? 0,
        valorRetidoTotal: document.retencoes?.totalRetido ?? 0,
        valorLiquido: document.retencoes?.valorLiquido ?? total,
        total,
        formaPagamento: document.formaPagamento,
        condicaoPagamento: document.condicaoPagamento,
        informacoesComplementares,
        emitidaEm: new Date(),
        itens: {
          create: computedItems.map(({ item, taxes, cfop, numeroItem }) => ({
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            produtoId: item.produtoId,
            numeroItem,
            codigo: item.codigo,
            descricao: item.descricao,
            ncm: item.ncm,
            cest: item.cest,
            cfop,
            unidade: item.unidade,
            quantidade: item.quantidade,
            valorUnitario: item.valorUnitario,
            valorTotal: item.valorTotal,
            desconto: item.desconto,
            origem: taxes.origem,
            cstIcms: taxes.cstIcms,
            csosn: taxes.csosn,
            baseIcms: taxes.baseIcms,
            aliquotaIcms: taxes.aliquotaIcms,
            valorIcms: taxes.valorIcms,
            percentualFcp: taxes.percentualFcp,
            valorFcp: taxes.valorFcp,
            modalidadeBcSt: taxes.modalidadeBcSt,
            percentualMva: taxes.percentualMva,
            baseIcmsSt: taxes.baseIcmsSt,
            aliquotaIcmsSt: taxes.aliquotaIcmsSt,
            valorIcmsSt: taxes.valorIcmsSt,
            valorTributos: taxes.valorTributos,
            cstIpi: taxes.cstIpi,
            aliquotaIpi: taxes.aliquotaIpi,
            valorIpi: taxes.valorIpi,
            cstPis: taxes.cstPis,
            aliquotaPis: taxes.aliquotaPis,
            valorPis: taxes.valorPis,
            cstCofins: taxes.cstCofins,
            aliquotaCofins: taxes.aliquotaCofins,
            valorCofins: taxes.valorCofins,
            itemListaServico: taxes.itemListaServico,
            aliquotaIss: taxes.aliquotaIss,
            valorIss: taxes.valorIss,
            cClassTrib: taxes.cClassTrib
          }))
        }
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: "EMIT_REQUEST",
      payload: { modelo, serie, numero, total, itens: computedItems.length }
    });

    return nota;
  }, TX_OPTIONS);

  // 2) Chama o provedor (fora da transação, pois pode ser I/O externo).
  const provider = resolveFiscalProvider(config.provider);
  const ctx: ProviderContext = {
    ambiente: config.ambiente,
    provedor: config.provider,
    baseUrl: config.baseUrl,
    emissionMode: config.emissionMode,
    token: config.token,
    cscId: config.cscId,
    cscToken: config.cscToken
  };

  let emitResult;
  try {
    emitResult = await provider.emit(
      {
        document: {
          ...document,
          serie,
          itens: computedItems.map(({ item, cfop }) => ({ ...item, cfop: cfop ?? item.cfop }))
        },
        emitter: { ...config.emitter, regime: config.regime },
        numero: Number(created.numero),
        totals,
        total,
        integrationId: (links.pedidoVendaId ?? links.ordemServicoId ?? created.id).slice(0, 36),
        computed: computedItems.map(({ numeroItem, cfop, taxes }) => ({ numeroItem, cfop, taxes }))
      },
      ctx
    );
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "Falha de comunicação com o provedor fiscal.";
    await prisma.$transaction(async (tx) => {
      await tx.notaFiscal.update({ where: { id: created.id }, data: { status: "ERRO", motivo } });
      await createAuditLog(tx, { scope, entidade: "NotaFiscal", entidadeId: created.id, acao: "EMIT_ERROR", payload: { motivo } });
    });
    throw new Error(motivo);
  }

  // 3) Atualiza com o resultado do provedor.
  const updated = await prisma.$transaction(async (tx) => {
    const authorized = emitResult.status === "AUTORIZADA";
    const nota = await tx.notaFiscal.update({
      where: { id: created.id },
      data: {
        status: emitResult.status,
        chaveAcesso: emitResult.chaveAcesso ?? null,
        protocolo: emitResult.protocolo ?? null,
        reciboLote: emitResult.reciboLote ?? null,
        providerRef: emitResult.providerRef ?? null,
        xml: emitResult.xml ?? null,
        xmlUrl: emitResult.xmlUrl ?? null,
        danfeUrl: emitResult.danfeUrl ?? null,
        motivo: emitResult.motivo ?? null,
        autorizadaEm: authorized ? new Date() : null
      },
      include: { itens: { orderBy: { numeroItem: "asc" } } }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: authorized ? "EMIT_AUTHORIZED" : "EMIT_RESULT",
      payload: { status: emitResult.status, chave: emitResult.chaveAcesso ?? null, motivo: emitResult.motivo ?? null }
    });

    return nota;
  }, TX_OPTIONS);

  return updated;
}

export async function cancelNotaFiscal(scope: TenantScope, notaId: string, justificativa: string) {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, tenantId: scope.tenantId, empresaId: scope.empresaId }
  });

  if (!nota) {
    throw new Error("Nota fiscal não encontrada.");
  }
  if (nota.status !== "AUTORIZADA") {
    throw new Error("Apenas notas autorizadas podem ser canceladas.");
  }
  // Trava de prazo legal de cancelamento (a SEFAZ também valida, mas avisamos antes):
  //  - NF-e (mod 55): 24h após a autorização; após isso exige cancelamento extemporâneo.
  //  - NFC-e (mod 65): 30 min (regra adotada pela maioria das UFs).
  //  - NFS-e: prazo varia por município — não bloqueamos aqui, a prefeitura valida.
  const limiteCancelHoras = nota.modelo === "NFE" ? 24 : nota.modelo === "NFCE" ? 0.5 : null;
  if (limiteCancelHoras !== null) {
    const referencia = nota.autorizadaEm ?? nota.emitidaEm;
    const horas = referencia ? (Date.now() - referencia.getTime()) / 3_600_000 : 0;
    if (horas > limiteCancelHoras) {
      const prazoLabel = limiteCancelHoras < 1 ? `${limiteCancelHoras * 60} minutos` : `${limiteCancelHoras} horas`;
      throw new Error(
        `Prazo de cancelamento da ${nota.modelo} esgotado (${prazoLabel} após a autorização). Use o procedimento de cancelamento extemporâneo junto à SEFAZ, se aplicável.`
      );
    }
  }
  if (justificativa.trim().length < 15) {
    throw new Error("A justificativa de cancelamento deve ter ao menos 15 caracteres.");
  }

  const config = await getFiscalRuntimeConfig(scope);
  const provider = resolveFiscalProvider(nota.provedor);
  const result = await provider.cancel(
    {
      modelo: nota.modelo,
      chaveAcesso: nota.chaveAcesso,
      providerRef: nota.providerRef,
      justificativa: justificativa.trim()
    },
    {
      ambiente: config.ambiente,
      provedor: nota.provedor,
      baseUrl: config.baseUrl,
      token: config.token,
      cscId: config.cscId,
      cscToken: config.cscToken
    }
  );

  return prisma.$transaction(async (tx) => {
    const authorized = result.status === "AUTORIZADO";
    const evento = await tx.notaFiscalEvento.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        notaFiscalId: nota.id,
        tipo: "CANCELAMENTO",
        status: authorized ? "AUTORIZADO" : result.status === "REJEITADO" ? "REJEITADO" : "ERRO",
        justificativa: justificativa.trim(),
        protocolo: result.protocolo ?? null,
        mensagem: result.motivo ?? null
      }
    });

    if (authorized) {
      await tx.notaFiscal.update({
        where: { id: nota.id },
        data: { status: "CANCELADA", canceladaEm: new Date(), motivo: justificativa.trim() }
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: "CANCEL",
      payload: { status: result.status, eventoId: evento.id }
    });

    if (!authorized) {
      throw new Error(result.motivo || "Provedor rejeitou o cancelamento da nota fiscal.");
    }

    return { id: nota.id, status: "CANCELADA" as const, eventoId: evento.id };
  }, TX_OPTIONS);
}

export async function createCartaCorrecao(scope: TenantScope, notaId: string, correcao: string) {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: { eventos: { where: { tipo: "CARTA_CORRECAO" } } }
  });

  if (!nota) {
    throw new Error("Nota fiscal não encontrada.");
  }
  if (nota.status !== "AUTORIZADA") {
    throw new Error("Apenas notas autorizadas aceitam carta de correção.");
  }
  // Carta de correção é exclusiva de NF-e e tem prazo legal de 30 dias (720h) da autorização.
  if (nota.modelo !== "NFE") {
    throw new Error("Carta de correção é exclusiva de NF-e (modelo 55).");
  }
  {
    const referencia = nota.autorizadaEm ?? nota.emitidaEm;
    const horas = referencia ? (Date.now() - referencia.getTime()) / 3_600_000 : 0;
    if (horas > 720) {
      throw new Error("Prazo de carta de correção esgotado (30 dias após a autorização).");
    }
  }
  if (correcao.trim().length < 15) {
    throw new Error("O texto da carta de correção deve ter ao menos 15 caracteres.");
  }

  const config = await getFiscalRuntimeConfig(scope);
  const provider = resolveFiscalProvider(nota.provedor);
  const sequencia = nota.eventos.length + 1;
  const result = await provider.correct(
    { chaveAcesso: nota.chaveAcesso, providerRef: nota.providerRef, sequencia, correcao: correcao.trim() },
    {
      ambiente: config.ambiente,
      provedor: nota.provedor,
      baseUrl: config.baseUrl,
      token: config.token,
      cscId: config.cscId,
      cscToken: config.cscToken
    }
  );

  return prisma.$transaction(async (tx) => {
    const authorized = result.status === "AUTORIZADO";
    const evento = await tx.notaFiscalEvento.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        notaFiscalId: nota.id,
        tipo: "CARTA_CORRECAO",
        status: authorized ? "AUTORIZADO" : result.status === "REJEITADO" ? "REJEITADO" : "ERRO",
        sequencia,
        correcao: correcao.trim(),
        protocolo: result.protocolo ?? null,
        mensagem: result.motivo ?? null
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "NotaFiscal",
      entidadeId: nota.id,
      acao: "CORRECTION",
      payload: { status: result.status, sequencia, eventoId: evento.id }
    });

    if (!authorized) {
      throw new Error(result.motivo || "Provedor rejeitou a carta de correção.");
    }

    return { id: nota.id, eventoId: evento.id, sequencia };
  }, TX_OPTIONS);
}

/**
 * Baixa o PDF (DANFE/DANFSE) ou o XML autorizado de uma nota, via provedor (server-side,
 * pois a ACBr exige Bearer). Retorna os bytes + content-type para a rota repassar.
 */
export async function downloadNotaFiscalDocumento(
  scope: TenantScope,
  notaId: string,
  kind: "pdf" | "xml"
): Promise<{ contentType: string; body: Buffer; filename: string }> {
  const nota = await prisma.notaFiscal.findFirst({
    where: { id: notaId, tenantId: scope.tenantId, empresaId: scope.empresaId }
  });
  if (!nota) {
    throw new Error("Nota fiscal não encontrada.");
  }
  if (!nota.providerRef) {
    throw new Error("A nota ainda não possui referência no provedor (não foi transmitida).");
  }
  if (nota.status !== "AUTORIZADA" && nota.status !== "CANCELADA") {
    throw new Error("Só é possível baixar PDF/XML de notas autorizadas ou canceladas.");
  }

  const config = await getFiscalRuntimeConfig(scope);
  const provider = resolveFiscalProvider(nota.provedor);
  if (!provider.downloadDocument) {
    throw new Error(`O provedor ${nota.provedor} não suporta download de PDF/XML pela plataforma.`);
  }

  const result = await provider.downloadDocument(
    kind,
    { providerRef: nota.providerRef, modelo: nota.modelo },
    {
      ambiente: config.ambiente,
      provedor: nota.provedor,
      baseUrl: config.baseUrl,
      token: config.token,
      cscId: config.cscId,
      cscToken: config.cscToken
    }
  );

  if (!result.ok) {
    throw new Error(result.error || `Não foi possível baixar o ${kind.toUpperCase()} da nota.`);
  }
  // Nome amigável: <modelo>-<numero>.<kind> (ex.: NFE-31.pdf).
  const filename = `${nota.modelo}-${nota.numero}.${kind}`;
  return { contentType: result.contentType, body: result.body, filename };
}
