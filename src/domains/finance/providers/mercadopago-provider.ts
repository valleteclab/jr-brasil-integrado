import {
  BankError,
  BankUnsupportedError,
  type BankProvider,
  type BoletoConsulta,
  type BoletoInput,
  type BoletoRegistrado,
  type ExtratoConta,
  type ExtratoParams,
  type PixCobConsulta,
  type PixCobCriada,
  type PixCobInput,
  type PixDevolucaoResult,
  type SaldoConta,
  type WebhookInfo
} from "./bank-provider";

/**
 * PROVEDOR MERCADO PAGO — cobrança pela conta MP que o cliente JÁ TEM, conectada via OAuth
 * (access_token por ContaBancaria; a aplicação client_id/secret é da plataforma).
 *
 * Mapeamento para a interface BankProvider:
 *  - Pix: POST /v1/payments (payment_method_id "pix") → BR Code em point_of_interaction.
 *    O "txid" nosso vai em external_reference (a consulta busca por ele); o id do payment
 *    faz o papel do e2eid na devolução (refund é por payment id).
 *  - Boleto: POST /v1/payments (payment_method_id "bolbradesco") → código de barras + PDF
 *    (baixado da external_resource_url e devolvido em base64). nossoNumero = id do payment.
 *  - Extrato/saldo: não expostos pela API de payments → BankUnsupportedError.
 * Baixa automática: pelo cron de sincronização (consulta por external_reference), como
 * Sicredi/Itaú. Sem chave Pix própria — o QR sai da conta MP.
 */

const API = "https://api.mercadopago.com";

type MpPayment = {
  id?: number;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  date_approved?: string;
  date_of_expiration?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
  transaction_details?: { external_resource_url?: string; digitable_line?: string };
  barcode?: { content?: string };
};

export type MercadoPagoConfig = {
  accessToken: string;
};

async function mpRequest<T>(
  cfg: MercadoPagoConfig,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string; cause?: Array<{ description?: string }> };
  if (!res.ok) {
    const causa = Array.isArray(data.cause) ? data.cause.map((c) => c.description).filter(Boolean).join("; ") : "";
    throw new BankError(`Mercado Pago: ${data.message || data.error || `HTTP ${res.status}`}${causa ? ` (${causa})` : ""}`);
  }
  return data;
}

/** Pagamento mais recente com a external_reference informada (nosso txid/seuNumero). */
async function buscarPorReferencia(cfg: MercadoPagoConfig, referencia: string): Promise<MpPayment | null> {
  const r = await mpRequest<{ results?: MpPayment[] }>(
    cfg,
    "GET",
    `/v1/payments/search?external_reference=${encodeURIComponent(referencia)}&sort=date_created&criteria=desc`
  );
  return r.results?.[0] ?? null;
}

/** Nome dividido em first/last (o MP pede separado no payer). */
function nomeSplit(nome: string): { first_name: string; last_name: string } {
  const partes = nome.trim().split(/\s+/);
  return { first_name: partes[0] ?? "Cliente", last_name: partes.slice(1).join(" ") || "-" };
}

function identificacao(cpfCnpj: string | null | undefined): { type: string; number: string } | undefined {
  const d = (cpfCnpj ?? "").replace(/\D/g, "");
  if (d.length === 11) return { type: "CPF", number: d };
  if (d.length === 14) return { type: "CNPJ", number: d };
  return undefined;
}

/** Status do MP → situação normalizada dos nossos fluxos. */
function situacaoBoleto(status: string | undefined): string {
  switch (status) {
    case "approved": return "LIQUIDADO";
    case "cancelled": return "BAIXADO";
    case "refunded": case "charged_back": return "DEVOLVIDO";
    default: return "EM ABERTO";
  }
}

function statusPix(status: string | undefined): string {
  switch (status) {
    case "approved": return "CONCLUIDA";
    case "cancelled": case "expired": return "REMOVIDA_PELO_USUARIO_RECEBEDOR";
    case "refunded": case "charged_back": return "DEVOLVIDA";
    default: return "ATIVA";
  }
}

export function createMercadoPagoProvider(cfg: MercadoPagoConfig): BankProvider {
  if (!cfg.accessToken) throw new BankError("Conta Mercado Pago não conectada — use \"Conectar Mercado Pago\" em Configurações → Contas financeiras.");

  return {
    banco: "MERCADO_PAGO",
    caps: { boleto: true, pix: true, extrato: false, webhookCobranca: false },

    // ─────────── Boleto ───────────
    async incluirBoleto(input: BoletoInput): Promise<BoletoRegistrado> {
      const pagador = input.pagador;
      const payment = await mpRequest<MpPayment>(cfg, "POST", "/v1/payments", {
        transaction_amount: input.valor,
        description: input.mensagens?.[0] ?? `Cobrança ${input.seuNumero}`,
        payment_method_id: "bolbradesco",
        external_reference: input.seuNumero,
        date_of_expiration: `${input.dataVencimento}T23:59:59.000-03:00`,
        payer: {
          email: pagador.email?.trim() || "pagador@sem-email.xerp",
          ...nomeSplit(pagador.nome),
          identification: identificacao(pagador.numeroCpfCnpj),
          address: {
            zip_code: pagador.cep.replace(/\D/g, ""),
            street_name: pagador.endereco || "-",
            street_number: "s/n",
            neighborhood: pagador.bairro || "-",
            city: pagador.cidade || "-",
            federal_unit: pagador.uf || "-"
          }
        }
      }, `bol-${input.seuNumero}`);

      // PDF do boleto: o MP devolve uma URL pública — baixa e devolve base64 (padrão da interface).
      let pdfBase64: string | null = null;
      const url = payment.transaction_details?.external_resource_url;
      if (url) {
        try {
          const pdf = await fetch(url);
          if (pdf.ok) pdfBase64 = Buffer.from(await pdf.arrayBuffer()).toString("base64");
        } catch { /* sem PDF → linha digitável/código de barras resolvem */ }
      }

      return {
        nossoNumero: payment.id != null ? String(payment.id) : null,
        linhaDigitavel: payment.transaction_details?.digitable_line ?? null,
        codigoBarras: payment.barcode?.content ?? null,
        pdfBase64,
        qrCodePix: null,
        bruto: payment
      };
    },

    async consultarBoleto(nossoNumero: string): Promise<BoletoConsulta> {
      const payment = await mpRequest<MpPayment>(cfg, "GET", `/v1/payments/${nossoNumero}`);
      return {
        situacao: situacaoBoleto(payment.status),
        valorPago: payment.status === "approved" ? payment.transaction_amount ?? null : null,
        dataPagamento: payment.date_approved ? payment.date_approved.slice(0, 10) : null,
        bruto: payment
      };
    },

    async baixarBoleto(nossoNumero: string): Promise<void> {
      await mpRequest(cfg, "PUT", `/v1/payments/${nossoNumero}`, { status: "cancelled" });
    },

    async prorrogarBoleto(nossoNumero: string, dataVencimento: string): Promise<void> {
      await mpRequest(cfg, "PUT", `/v1/payments/${nossoNumero}`, {
        date_of_expiration: `${dataVencimento}T23:59:59.000-03:00`
      });
    },

    async cadastrarWebhookCobranca(): Promise<number> {
      throw new BankUnsupportedError("Webhook do Mercado Pago é configurado na aplicação da plataforma — a baixa acontece pela sincronização automática.");
    },
    async consultarWebhooksCobranca(): Promise<WebhookInfo[]> {
      return [];
    },

    // ─────────── Pix ───────────
    async criarCobrancaPix(input: PixCobInput): Promise<PixCobCriada> {
      const payment = await mpRequest<MpPayment>(cfg, "POST", "/v1/payments", {
        transaction_amount: input.valor,
        description: input.solicitacaoPagador ?? "Cobrança Pix",
        payment_method_id: "pix",
        external_reference: input.txid,
        date_of_expiration: new Date(Date.now() + (input.expiracaoSeg ?? 3600) * 1000).toISOString().replace("Z", "-00:00"),
        payer: {
          email: "pagador@sem-email.xerp",
          ...(input.devedor ? nomeSplit(input.devedor.nome) : {}),
          identification: identificacao(input.devedor?.cpf ?? input.devedor?.cnpj)
        }
      }, `pix-${input.txid}`);

      const td = payment.point_of_interaction?.transaction_data;
      return {
        txid: input.txid,
        status: statusPix(payment.status),
        brcode: td?.qr_code ?? null,
        location: td?.ticket_url ?? null,
        bruto: payment
      };
    },

    async consultarCobrancaPix(txid: string): Promise<PixCobConsulta> {
      const payment = await buscarPorReferencia(cfg, txid);
      if (!payment) return { status: null, valorPago: null, e2eid: null, pagoEm: null, bruto: null };
      return {
        status: statusPix(payment.status),
        valorPago: payment.status === "approved" ? payment.transaction_amount ?? null : null,
        // O MP não expõe o endToEndId do BACEN — o id do payment cumpre o papel (refund é por id).
        e2eid: payment.id != null ? String(payment.id) : null,
        pagoEm: payment.date_approved ?? null,
        bruto: payment
      };
    },

    async devolverPix(e2eId: string, _idDevolucao: string, valor: number): Promise<PixDevolucaoResult> {
      // e2eId aqui é o id do payment (ver consultarCobrancaPix). Refund total ou parcial.
      const r = await mpRequest<{ id?: number; status?: string }>(
        cfg, "POST", `/v1/payments/${e2eId}/refunds`, { amount: valor }, `ref-${e2eId}`
      );
      return { id: r.id != null ? String(r.id) : e2eId, status: r.status ?? null, bruto: r };
    },

    // ─────────── Conta-corrente ───────────
    async consultarSaldo(): Promise<SaldoConta> {
      throw new BankUnsupportedError("Saldo/extrato da conta Mercado Pago não estão disponíveis pela integração — consulte no app do MP.");
    },
    async consultarExtrato(_c: string, _p: ExtratoParams): Promise<ExtratoConta> {
      throw new BankUnsupportedError("Extrato da conta Mercado Pago não está disponível pela integração — consulte no app do MP.");
    }
  };
}
