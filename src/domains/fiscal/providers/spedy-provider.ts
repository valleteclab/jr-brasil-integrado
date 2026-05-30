import type { ModeloFiscal, StatusNotaFiscal } from "@prisma/client";
import type { ItemTaxResult } from "../types";
import type {
  CancelInput,
  CancelResult,
  ComputedItemTax,
  CorrectionInput,
  CorrectionResult,
  EmitInput,
  EmitResult,
  FiscalProvider,
  ProviderContext,
  ProviderEmitter
} from "./types";

/**
 * Provedor fiscal Spedy (https://api.spedy.com.br) — integração real e completa.
 *
 * Modo "completo": montamos o corpo inteiro da nota (itens, tributos, totais) a partir do
 * documento normalizado e dos tributos já calculados pelo tax-engine, em vez de delegar o
 * cálculo ao provedor. A emissão é assíncrona: o POST inicial enfileira a nota e devolve um
 * UUID; consultamos o status por polling até um estado final (ou devolvemos PROCESSANDO para
 * o webhook concluir depois).
 *
 * Atenção às unidades de alíquota exigidas pela Spedy:
 *  - icms.rate e issRate de NF-e/NFC-e ... aqui icms.rate é PERCENTUAL (ex.: 18.0)
 *  - pis.rate / cofins.rate ............... FRAÇÃO (ex.: 0.0065)
 *  - NFS-e total.issRate .................. FRAÇÃO (ex.: 0.05)
 */

// ---------------------------------------------------------------------------
// Tipos locais do payload Spedy (apenas os campos que utilizamos).
// ---------------------------------------------------------------------------

/** Cidade por código IBGE (preferencial) ou por nome+UF. */
type SpedyCity = { code: string } | { name: string; state: string };

type SpedyAddress = {
  street?: string;
  number?: string;
  district?: string;
  zipCode?: string;
  complement?: string;
  city?: SpedyCity;
  state?: string;
};

type SpedyReceiver = {
  name?: string;
  federalTaxNumber?: string;
  stateTaxNumber?: string | null;
  email?: string | null;
  address?: SpedyAddress;
};

/** ICMS do Simples Nacional: CSOSN. */
type SpedyIcmsSimples = {
  origin: number;
  csosn: number;
  snCreditRate?: number;
  snCreditAmount?: number;
  stRetentionAmount?: number;
  baseStRetentionAmount?: number;
};

/** ICMS do Regime Normal: CST. */
type SpedyIcmsNormal = {
  origin: number;
  cst: number;
  baseTaxModality?: number;
  baseTax?: number;
  baseTaxReduction?: number;
  rate?: number;
  amount?: number;
  stRetention?: number;
  baseStRetention?: number;
};

type SpedyIcms = SpedyIcmsSimples | SpedyIcmsNormal;

type SpedyPisCofins = {
  cst: number;
  baseTax?: number;
  rate?: number;
  amount?: number;
};

type SpedyItemTaxes = {
  icms: SpedyIcms;
  pis: SpedyPisCofins;
  cofins: SpedyPisCofins;
};

type SpedyItem = {
  code: string;
  description: string;
  ncm?: string;
  cfop?: number;
  unit: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  unitTax: number;
  quantityTax: number;
  unitTaxAmount: number;
  makeupTotal: true;
  taxes: SpedyItemTaxes;
};

type SpedyPayment = {
  method: string;
  amount: number;
};

type SpedyTotal = {
  invoiceAmount: number;
  productAmount?: number;
  icmsBaseTax?: number;
  icmsAmount?: number;
  icmsStAmount?: number;
  pisAmount?: number;
  cofinsAmount?: number;
};

/** Corpo de emissão de NF-e / NFC-e (modo completo). */
type SpedyProductOrConsumerInvoice = {
  integrationId?: string;
  isFinalCustomer: boolean;
  operationType: "outgoing" | "incoming";
  destination: "internal" | "interstate" | "international";
  presenceType: string;
  operationNature: string;
  sendEmailToCustomer: boolean;
  receiver: SpedyReceiver;
  items: SpedyItem[];
  payments: SpedyPayment[];
  total: SpedyTotal;
};

/** Corpo de emissão de NFS-e. */
type SpedyServiceInvoice = {
  integrationId?: string;
  status: "enqueued";
  sendEmailToCustomer: boolean;
  description: string;
  federalServiceCode?: string;
  taxationType: string;
  receiver: SpedyReceiver;
  total: {
    invoiceAmount: number;
    issRate: number;
    issAmount: number;
    issWithheld: boolean;
    irRate?: number;
    irAmount?: number;
    irWithheld?: boolean;
    pisRate?: number;
    pisAmount?: number;
    pisWithheld?: boolean;
    cofinsRate?: number;
    cofinsAmount?: number;
    cofinsWithheld?: boolean;
    csllRate?: number;
    csllAmount?: number;
    csllWithheld?: boolean;
    inssRate?: number;
    inssAmount?: number;
    inssWithheld?: boolean;
    netAmount?: number;
  };
};

/** Resposta de uma nota (POST inicial e GET de consulta). */
type SpedyInvoiceResponse = {
  id?: string;
  status?: string;
  accessKey?: string;
  number?: number | string;
  authorization?: { date?: string; protocol?: string } | null;
  processingDetail?: { status?: string; message?: string; code?: string } | null;
};

/** Resposta de operações booleanas (cancelar/excluir). */
type SpedyBooleanResponse = { success?: boolean };

/** Envelope de erro padrão da Spedy. */
type SpedyErrorResponse = { errors?: Array<{ message?: string; code?: string }> };

// ---------------------------------------------------------------------------
// Constantes e helpers de mapeamento.
// ---------------------------------------------------------------------------

const SPEDY_BASE_URL: Record<ProviderContext["ambiente"], string> = {
  PRODUCAO: "https://api.spedy.com.br/v1",
  HOMOLOGACAO: "https://sandbox-api.spedy.com.br/v1"
};

/** Quantidade de tentativas e intervalo (ms) do polling de status. */
const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 3000;

/** Segmento de URL do modelo fiscal na API Spedy. */
function modelSegment(modelo: ModeloFiscal): "product-invoices" | "consumer-invoices" | "service-invoices" {
  switch (modelo) {
    case "NFE":
      return "product-invoices";
    case "NFCE":
      return "consumer-invoices";
    case "NFSE":
      return "service-invoices";
    default:
      // Exaustividade: novos modelos devem ser tratados explicitamente.
      throw new Error(`Modelo fiscal não suportado pela Spedy: ${String(modelo)}`);
  }
}

/** Mantém apenas dígitos de um documento (CPF/CNPJ/CEP). */
function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Converte string numérica em number; retorna undefined se vazia/inválida. */
function toNumberOrUndefined(value: string | null | undefined): number | undefined {
  if (value == null) return undefined;
  const digits = value.replace(/\D/g, "");
  if (!digits) return undefined;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Mapeia status textual da Spedy para o StatusNotaFiscal interno. */
function mapStatus(status: string | null | undefined): StatusNotaFiscal {
  switch ((status ?? "").toLowerCase()) {
    case "authorized":
      return "AUTORIZADA";
    case "rejected":
      return "REJEITADA";
    case "denied":
      return "DENEGADA";
    case "canceled":
    case "disabled":
    case "removed":
      return "CANCELADA";
    case "created":
    case "enqueued":
    case "received":
    case "incontingent":
      return "PROCESSANDO";
    default:
      return "PROCESSANDO";
  }
}

/** Estados finais (não há mais o que aguardar no polling). */
function isFinalStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "authorized" || s === "rejected" || s === "denied" || s === "canceled";
}

/** True para regimes do Simples Nacional (incluindo MEI e excesso de sublimite). */
function isSimplesRegime(regime: ProviderEmitter["regime"]): boolean {
  return regime === "SIMPLES_NACIONAL" || regime === "MEI" || regime === "SIMPLES_EXCESSO_SUBLIMITE";
}

/** Promise de espera não-bloqueante (não trava o event loop). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Provedor.
// ---------------------------------------------------------------------------

export class SpedyFiscalProvider implements FiscalProvider {
  readonly id = "SPEDY" as const;

  // -------------------------------------------------------------------------
  // Cliente HTTP.
  // -------------------------------------------------------------------------

  /** Resolve baseUrl (override do contexto > ambiente) e exige token. */
  private resolveConfig(ctx: ProviderContext): { baseUrl: string; token: string } {
    const token = ctx.token?.trim();
    if (!token) {
      throw new Error(
        "Provedor Spedy selecionado, mas a chave de API (X-Api-Key) não está configurada. Configure em Configurações › Fiscal."
      );
    }
    const base = (ctx.baseUrl?.trim() || SPEDY_BASE_URL[ctx.ambiente]).replace(/\/$/, "");
    return { baseUrl: base, token };
  }

  /** Faz uma chamada à API. Trata 429, erros HTTP e JSON malformado. Nunca loga o token. */
  private async request<T>(
    ctx: ProviderContext,
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<{ ok: boolean; status: number; data: T; errorMessage: string | null }> {
    const { baseUrl, token } = this.resolveConfig(ctx);
    const url = `${baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "X-Api-Key": token,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (err) {
      // Falha de rede/timeout — não vaza token (a mensagem da Spedy não o contém).
      const reason = err instanceof Error ? err.message : "erro desconhecido";
      throw new Error(`Falha de comunicação com a Spedy: ${reason}`);
    }

    const raw = await response.text().catch(() => "");
    let data: unknown = undefined;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        // JSON malformado — preserva a resposta crua para diagnóstico.
        data = undefined;
      }
    }

    let errorMessage: string | null = null;
    if (!response.ok) {
      if (response.status === 429) {
        errorMessage = "Limite de requisições da Spedy excedido (HTTP 429). Tente novamente em instantes.";
      } else {
        const err = data as SpedyErrorResponse | undefined;
        const first = err?.errors?.[0];
        errorMessage =
          first?.message ??
          (raw && data === undefined ? `Resposta inválida da Spedy (HTTP ${response.status}).` : null) ??
          `A Spedy retornou HTTP ${response.status}.`;
      }
    }

    return { ok: response.ok, status: response.status, data: data as T, errorMessage };
  }

  // -------------------------------------------------------------------------
  // Montagem do corpo.
  // -------------------------------------------------------------------------

  /** Monta o receiver (destinatário) a partir do documento normalizado. */
  /**
   * Tomador da NFS-e (Ambiente Nacional): quando há CNPJ/CPF, o schema nacional NÃO aceita
   * o nome (`xNome`) — a Receita resolve o nome pelo documento (rejeição E1235). Por isso o
   * `name` só é enviado quando NÃO há documento (tomador não identificado/sem NI).
   */
  private buildServiceReceiver(input: EmitInput): SpedyReceiver {
    const base = this.buildReceiver(input);
    // Tomador identificado por CNPJ/CPF: o schema nacional aceita apenas o documento
    // (e contato), sem nome (`xNome`) nem endereço (`end`) — a Receita os resolve (E1235).
    if (base.federalTaxNumber) {
      // Tomador identificado: documento + nome (exigido), sem endereço/e-mail no bloco `toma`.
      return { federalTaxNumber: base.federalTaxNumber, name: base.name, stateTaxNumber: base.stateTaxNumber };
    }
    return base;
  }

  private buildReceiver(input: EmitInput): SpedyReceiver {
    const dest = input.document.destinatario;
    const endereco = dest.endereco;

    let address: SpedyAddress | undefined;
    if (endereco) {
      let city: SpedyCity | undefined;
      if (endereco.codigoMunicipioIbge) {
        city = { code: endereco.codigoMunicipioIbge };
      } else if (endereco.cidade && (endereco.uf ?? dest.uf)) {
        city = { name: endereco.cidade, state: (endereco.uf ?? dest.uf) as string };
      }
      address = {
        street: endereco.logradouro ?? undefined,
        number: endereco.numero ?? undefined,
        complement: endereco.complemento ?? undefined,
        district: endereco.bairro ?? undefined,
        zipCode: onlyDigits(endereco.cep) || undefined,
        state: endereco.uf ?? dest.uf ?? undefined,
        city
      };
    }

    return {
      name: dest.nome,
      federalTaxNumber: onlyDigits(dest.documento) || undefined,
      stateTaxNumber: dest.inscricaoEstadual,
      email: dest.email,
      address
    };
  }

  /** Localiza os tributos calculados de um item pelo número do item (1-based). */
  private taxesForItem(computed: ComputedItemTax[], numeroItem: number): ItemTaxResult | null {
    return computed.find((entry) => entry.numeroItem === numeroItem)?.taxes ?? null;
  }

  /** Monta o bloco taxes.icms conforme o regime do emitente. */
  private buildIcms(taxes: ItemTaxResult, regime: ProviderEmitter["regime"]): SpedyIcms {
    const origin = Number(taxes.origem ?? "0") || 0;

    if (isSimplesRegime(regime)) {
      const csosn = Number(taxes.csosn ?? "102") || 102;
      const icms: SpedyIcmsSimples = { origin, csosn };
      // CSOSN 500: mercadoria com ICMS-ST já retido anteriormente.
      if (csosn === 500 && taxes.valorIcmsSt > 0) {
        icms.stRetentionAmount = taxes.valorIcmsSt;
        icms.baseStRetentionAmount = taxes.baseIcmsSt;
      }
      return icms;
    }

    // Regime Normal: ICMS destacado por CST.
    const cst = Number(taxes.cstIcms ?? "00") || 0;
    const icms: SpedyIcmsNormal = {
      origin,
      cst,
      baseTaxModality: 3, // 3 = valor da operação
      baseTax: taxes.baseIcms,
      baseTaxReduction: 0,
      rate: taxes.aliquotaIcms, // PERCENTUAL (ex.: 18.0)
      amount: taxes.valorIcms
    };
    // CST 60 (já retido) ou 70 (com redução + ST): informar ICMS-ST quando houver.
    if ((cst === 60 || cst === 70) && taxes.valorIcmsSt > 0) {
      icms.stRetention = taxes.valorIcmsSt;
      icms.baseStRetention = taxes.baseIcmsSt;
    }
    return icms;
  }

  /** Monta um item NF-e/NFC-e no modo completo. */
  private buildItem(
    item: EmitInput["document"]["itens"][number],
    numeroItem: number,
    taxes: ItemTaxResult,
    regime: ProviderEmitter["regime"]
  ): SpedyItem {
    const cfop = toNumberOrUndefined(item.cfop);

    return {
      code: item.codigo,
      description: item.descricao,
      ncm: item.ncm ?? undefined,
      cfop,
      unit: item.unidade,
      quantity: item.quantidade,
      unitAmount: item.valorUnitario,
      totalAmount: item.valorTotal,
      // Tributos aproximados (Lei 12.741): valor por unidade e total.
      unitTax: item.quantidade > 0 ? taxes.valorTributos / item.quantidade : 0,
      quantityTax: item.quantidade,
      unitTaxAmount: taxes.valorTributos,
      makeupTotal: true,
      taxes: {
        icms: this.buildIcms(taxes, regime),
        // pis.rate / cofins.rate em FRAÇÃO (alíquota percentual / 100).
        pis: {
          cst: Number(taxes.cstPis ?? (isSimplesRegime(regime) ? "49" : "01")) || (isSimplesRegime(regime) ? 49 : 1),
          baseTax: item.valorTotal - item.desconto,
          rate: taxes.aliquotaPis / 100,
          amount: taxes.valorPis
        },
        cofins: {
          cst: Number(taxes.cstCofins ?? (isSimplesRegime(regime) ? "49" : "01")) || (isSimplesRegime(regime) ? 49 : 1),
          baseTax: item.valorTotal - item.desconto,
          rate: taxes.aliquotaCofins / 100,
          amount: taxes.valorCofins
        }
      }
    };
  }

  /** Deriva destination (interna/interestadual) a partir das UFs. NFC-e é sempre interna. */
  private buildDestination(input: EmitInput): "internal" | "interstate" {
    if (input.document.modelo === "NFCE") return "internal";
    const ufEmit = input.emitter.uf?.toUpperCase() ?? null;
    const ufDest = (input.document.destinatario.endereco?.uf ?? input.document.destinatario.uf)?.toUpperCase() ?? null;
    if (!ufEmit || !ufDest) return "internal";
    return ufEmit === ufDest ? "internal" : "interstate";
  }

  /** Monta a lista de pagamentos (NF-e/NFC-e). Fallback "other" quando não há forma definida. */
  private buildPayments(input: EmitInput): SpedyPayment[] {
    const method = this.mapPaymentMethod(input.document.formaPagamento);
    return [{ method, amount: input.total }];
  }

  /** Traduz a forma de pagamento textual para o vocabulário da Spedy. */
  private mapPaymentMethod(forma: string | null): string {
    const f = (forma ?? "").toLowerCase();
    if (f.includes("pix")) return "pix";
    if (f.includes("credito") || f.includes("crédito") || f.includes("credit")) return "creditCard";
    if (f.includes("debito") || f.includes("débito") || f.includes("debit")) return "debitCard";
    if (f.includes("boleto") || f.includes("billet")) return "billetBank";
    if (f.includes("dinheiro") || f.includes("cash") || f.includes("especie") || f.includes("espécie")) return "cash";
    if (f.includes("transfer")) return "bankTransfer";
    return "other";
  }

  /** Corpo de NF-e/NFC-e no modo completo. */
  private buildProductOrConsumerBody(input: EmitInput): SpedyProductOrConsumerInvoice {
    const regime = input.emitter.regime;
    const isConsumer = input.document.modelo === "NFCE";

    const items = input.document.itens.map((item, index) => {
      const numeroItem = index + 1;
      const taxes = this.taxesForItem(input.computed, numeroItem);
      if (!taxes) {
        throw new Error(`Tributos do item ${numeroItem} não foram calculados para emissão na Spedy.`);
      }
      return this.buildItem(item, numeroItem, taxes, regime);
    });

    return {
      integrationId: input.integrationId,
      // NFC-e é sempre para consumidor final; NF-e quando o destinatário não tem IE.
      isFinalCustomer: isConsumer || !input.document.destinatario.inscricaoEstadual,
      operationType: "outgoing",
      destination: this.buildDestination(input),
      presenceType: "presence",
      operationNature: input.document.naturezaOperacao,
      sendEmailToCustomer: Boolean(input.document.destinatario.email),
      receiver: this.buildReceiver(input),
      items,
      payments: this.buildPayments(input),
      total: {
        invoiceAmount: input.total,
        productAmount: input.totals.valorProdutos,
        icmsAmount: input.totals.valorIcms,
        icmsStAmount: input.totals.valorIcmsSt,
        pisAmount: input.totals.valorPis,
        cofinsAmount: input.totals.valorCofins
      }
    };
  }

  /** Corpo de NFS-e. */
  private buildServiceBody(input: EmitInput): SpedyServiceInvoice {
    // NFS-e: usa o primeiro item de serviço como referência de ISS/código de serviço.
    const servicoTax = input.computed.find((entry) => {
      const taxes = entry.taxes;
      return taxes.aliquotaIss > 0 || taxes.itemListaServico != null;
    })?.taxes;

    const aliquotaIss = servicoTax?.aliquotaIss ?? 0;
    const valorIss = input.totals.valorIss;
    const federalServiceCode = servicoTax?.itemListaServico ?? undefined;

    const description =
      input.document.informacoesComplementares?.trim() ||
      input.document.itens.map((item) => item.descricao).join("; ") ||
      input.document.naturezaOperacao;

    // Retenções na fonte: ISS retido pelo tomador + retenções federais (IRRF/PIS/COFINS/CSLL/INSS).
    // Alíquotas em fração na Spedy (ex.: 0.015 para 1,5%).
    const ret = input.document.retencoes ?? null;
    const retField = (r: { aliquota: number; valor: number } | null | undefined, rate: string, amount: string, withheld: string) =>
      r ? { [rate]: r.aliquota / 100, [amount]: r.valor, [withheld]: true } : {};

    return {
      integrationId: input.integrationId,
      status: "enqueued",
      sendEmailToCustomer: Boolean(input.document.destinatario.email),
      description,
      federalServiceCode,
      taxationType: input.document.taxationType ?? "taxationInMunicipality",
      receiver: this.buildServiceReceiver(input),
      total: {
        invoiceAmount: input.total,
        issRate: aliquotaIss / 100, // FRAÇÃO (ex.: 0.05)
        issAmount: valorIss,
        issWithheld: ret?.issRetido ?? false,
        ...retField(ret?.ir, "irRate", "irAmount", "irWithheld"),
        ...retField(ret?.pis, "pisRate", "pisAmount", "pisWithheld"),
        ...retField(ret?.cofins, "cofinsRate", "cofinsAmount", "cofinsWithheld"),
        ...retField(ret?.csll, "csllRate", "csllAmount", "csllWithheld"),
        ...retField(ret?.inss, "inssRate", "inssAmount", "inssWithheld"),
        ...(ret ? { netAmount: ret.valorLiquido } : {})
      }
    };
  }

  // -------------------------------------------------------------------------
  // Polling de status após o POST.
  // -------------------------------------------------------------------------

  /** Consulta GET /{model}/{id} até estado final ou esgotar as tentativas. */
  private async pollUntilFinal(
    ctx: ProviderContext,
    segment: string,
    id: string,
    initial: SpedyInvoiceResponse
  ): Promise<SpedyInvoiceResponse> {
    let current = initial;
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      if (isFinalStatus(current.status)) return current;
      await delay(POLL_INTERVAL_MS);
      const res = await this.request<SpedyInvoiceResponse>(ctx, "GET", `/${segment}/${encodeURIComponent(id)}`);
      if (res.ok && res.data) {
        current = res.data;
      }
      // Em caso de erro transitório na consulta, mantém o último estado e tenta de novo.
    }
    return current;
  }

  /** Converte a resposta final da Spedy em EmitResult, montando URLs de XML/PDF. */
  private toEmitResult(ctx: ProviderContext, segment: string, invoice: SpedyInvoiceResponse): EmitResult {
    const baseUrl = (ctx.baseUrl?.trim() || SPEDY_BASE_URL[ctx.ambiente]).replace(/\/$/, "");
    const id = invoice.id;
    const status = mapStatus(invoice.status);

    const result: EmitResult = {
      status,
      providerRef: id,
      chaveAcesso: invoice.accessKey ?? undefined,
      protocolo: invoice.authorization?.protocol ?? undefined
    };

    if (status === "AUTORIZADA" && id) {
      result.xmlUrl = `${baseUrl}/${segment}/${encodeURIComponent(id)}/xml`;
      result.danfeUrl = `${baseUrl}/${segment}/${encodeURIComponent(id)}/pdf`;
      result.motivo = "Autorizado o uso da nota fiscal.";
    } else if (status === "REJEITADA" || status === "DENEGADA") {
      const detail = invoice.processingDetail;
      const parts = [detail?.message, detail?.code ? `(${detail.code})` : null].filter(Boolean);
      result.motivo = parts.join(" ") || "Nota rejeitada pela Spedy/SEFAZ.";
    } else {
      result.motivo = "Emissão em processamento na Spedy. O status será atualizado via webhook.";
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Interface FiscalProvider.
  // -------------------------------------------------------------------------

  async emit(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    const modelo = input.document.modelo;
    const segment = modelSegment(modelo);

    const body: SpedyProductOrConsumerInvoice | SpedyServiceInvoice =
      modelo === "NFSE" ? this.buildServiceBody(input) : this.buildProductOrConsumerBody(input);

    const res = await this.request<SpedyInvoiceResponse>(ctx, "POST", `/${segment}`, body);
    if (!res.ok) {
      return { status: "ERRO", motivo: res.errorMessage ?? "Falha ao enviar a nota à Spedy." };
    }

    const created = res.data;
    if (!created?.id) {
      return { status: "ERRO", motivo: "A Spedy não retornou o identificador da nota emitida." };
    }

    // Emissão assíncrona: aguarda o estado final por polling não-bloqueante.
    const final = await this.pollUntilFinal(ctx, segment, created.id, created);
    return this.toEmitResult(ctx, segment, final);
  }

  async cancel(input: CancelInput, ctx: ProviderContext): Promise<CancelResult> {
    if (!input.providerRef) {
      return { status: "ERRO", motivo: "Identificador da nota (providerRef) ausente para cancelamento na Spedy." };
    }
    if (input.justificativa.trim().length < 15) {
      return { status: "REJEITADO", motivo: "Justificativa de cancelamento deve ter ao menos 15 caracteres." };
    }
    const segment = modelSegment(input.modelo);
    const res = await this.request<SpedyBooleanResponse>(ctx, "DELETE", `/${segment}/${encodeURIComponent(input.providerRef)}`, {
      justification: input.justificativa
    });
    if (!res.ok) {
      return { status: "ERRO", motivo: res.errorMessage ?? "Falha ao cancelar a nota na Spedy." };
    }
    if (res.data?.success === false) {
      return { status: "REJEITADO", motivo: "A Spedy recusou o cancelamento da nota." };
    }
    return { status: "AUTORIZADO" };
  }

  async correct(input: CorrectionInput, ctx: ProviderContext): Promise<CorrectionResult> {
    if (!input.providerRef) {
      return { status: "ERRO", motivo: "Identificador da nota (providerRef) ausente para carta de correção na Spedy." };
    }
    if (input.correcao.trim().length < 15) {
      return { status: "REJEITADO", motivo: "Texto da carta de correção deve ter ao menos 15 caracteres." };
    }
    // CC-e existe apenas para NF-e (product-invoices). NFC-e/NFS-e não possuem.
    const res = await this.request<SpedyBooleanResponse>(
      ctx,
      "POST",
      `/product-invoices/${encodeURIComponent(input.providerRef)}/corrections`,
      { description: input.correcao }
    );
    if (!res.ok) {
      // 404/400 normalmente indica que o documento não admite CC-e (NFC-e/NFS-e).
      return {
        status: "REJEITADO",
        motivo: res.errorMessage ?? "Carta de correção indisponível para este documento (apenas NF-e admite CC-e)."
      };
    }
    if (res.data?.success === false) {
      return { status: "REJEITADO", motivo: "A Spedy recusou a carta de correção." };
    }
    return { status: "AUTORIZADO" };
  }

  /**
   * Consulta de status. A interface recebe um "chaveAcesso", mas guardamos o UUID da Spedy em
   * providerRef — aceitamos o valor recebido como id e consultamos os três segmentos, pois o
   * modelo não é informado nesta chamada. Retorna o primeiro que existir.
   */
  async queryStatus(idOrKey: string, ctx: ProviderContext): Promise<EmitResult> {
    const segments: Array<ReturnType<typeof modelSegment>> = ["product-invoices", "consumer-invoices", "service-invoices"];
    for (const segment of segments) {
      const res = await this.request<SpedyInvoiceResponse>(ctx, "GET", `/${segment}/${encodeURIComponent(idOrKey)}`);
      if (res.ok && res.data?.id) {
        return this.toEmitResult(ctx, segment, res.data);
      }
    }
    return { status: "PROCESSANDO", providerRef: idOrKey, motivo: "Nota não localizada na Spedy para consulta de status." };
  }
}
