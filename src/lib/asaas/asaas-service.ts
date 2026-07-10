import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-crypto";

/**
 * Gateway de cobrança da PLATAFORMA (Asaas — conta da Valleteclab). Usado só no plano da
 * plataforma: recarga da carteira de créditos de consulta dos tenants (tenant → Valleteclab).
 * NÃO se confunde com o Sicoob de cada tenant (vendas → clientes finais).
 *
 * Auth: header `access_token`. Chave `aact_hmlg_...` = homologação (sandbox).
 * Docs: https://docs.asaas.com/
 */

const PROD = "https://api.asaas.com/v3";
const SANDBOX = "https://api-sandbox.asaas.com/v3";

export type AsaasRuntime = { apiKey: string; walletId: string | null; sandbox: boolean; webhookToken: string | null };

/** Config efetiva do Asaas (chave descriptografada) a partir da config de plataforma. */
export async function getAsaasRuntime(): Promise<AsaasRuntime | null> {
  const cfg = await prisma.plataformaCredito.findUnique({ where: { id: "default" } });
  if (!cfg?.asaasApiKeyCripto) return null;
  return {
    apiKey: decryptSecret(cfg.asaasApiKeyCripto),
    walletId: cfg.asaasWalletId,
    sandbox: cfg.asaasSandbox,
    webhookToken: cfg.asaasWebhookToken
  };
}

function baseUrl(rt: AsaasRuntime): string {
  // Deixa o prefixo da chave mandar (hmlg = sandbox), com a flag como reforço.
  return rt.sandbox || rt.apiKey.includes("_hmlg_") ? SANDBOX : PROD;
}

async function asaas<T>(rt: AsaasRuntime, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl(rt)}${path}`, {
    method,
    headers: { "Content-Type": "application/json", access_token: rt.apiKey, "User-Agent": "XERP" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const erros = (data?.errors as Array<{ description?: string }> | undefined)?.map((e) => e.description).filter(Boolean);
    throw new Error(erros?.length ? erros.join(" | ") : `Asaas ${method} ${path} falhou (HTTP ${res.status}).`);
  }
  return data as T;
}

/** Cria (ou reaproveita) o cliente Asaas pagador — aqui, o próprio tenant que recarrega. */
export async function asaasGarantirCliente(
  rt: AsaasRuntime,
  input: { nome: string; cpfCnpj?: string | null; email?: string | null; externalReference: string }
): Promise<string> {
  const cli = await asaas<{ id: string }>(rt, "POST", "/customers", {
    name: input.nome.slice(0, 100),
    cpfCnpj: input.cpfCnpj ? input.cpfCnpj.replace(/\D/g, "") : undefined,
    email: input.email ?? undefined,
    externalReference: input.externalReference,
    notificationDisabled: true
  });
  return cli.id;
}

export type AsaasPix = { paymentId: string; status: string; payload: string | null; qrBase64: string | null; expiraEm: string | null };

/** Cria uma cobrança Pix e devolve o QR dinâmico (imagem base64 + copia-e-cola). */
export async function asaasCriarPix(
  rt: AsaasRuntime,
  input: { customerId: string; valor: number; descricao: string; externalReference: string; vencimento: string }
): Promise<AsaasPix> {
  const pay = await asaas<{ id: string; status: string }>(rt, "POST", "/payments", {
    customer: input.customerId,
    billingType: "PIX",
    value: Math.round(input.valor * 100) / 100,
    dueDate: input.vencimento,
    description: input.descricao.slice(0, 500),
    externalReference: input.externalReference
  });
  // QR dinâmico do pagamento.
  const qr = await asaas<{ encodedImage?: string; payload?: string; expirationDate?: string }>(
    rt, "GET", `/payments/${pay.id}/pixQrCode`
  ).catch(() => ({ encodedImage: undefined, payload: undefined, expirationDate: undefined }));
  return {
    paymentId: pay.id,
    status: pay.status,
    payload: qr.payload ?? null,
    qrBase64: qr.encodedImage ?? null,
    expiraEm: qr.expirationDate ?? null
  };
}

/** DIAGNÓSTICO: QR Pix cru de um pagamento (devolve o erro do Asaas, se houver). */
export async function asaasPixQrCodeRaw(rt: AsaasRuntime, paymentId: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${baseUrl(rt)}/payments/${paymentId}/pixQrCode`, {
    headers: { access_token: rt.apiKey, "User-Agent": "XERP" }
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/**
 * Cria uma ASSINATURA mensal (mensalidade do plano). billingType UNDEFINED deixa o cliente
 * escolher Pix/boleto/cartão na fatura. Devolve o id e o link da primeira fatura.
 */
export async function asaasCriarAssinatura(
  rt: AsaasRuntime,
  input: { customerId: string; valor: number; descricao: string; externalReference: string }
): Promise<{ id: string; invoiceUrl: string | null }> {
  const sub = await asaas<{ id: string }>(rt, "POST", "/subscriptions", {
    customer: input.customerId,
    billingType: "UNDEFINED",
    value: Math.round(input.valor * 100) / 100,
    nextDueDate: new Date().toISOString().slice(0, 10),
    cycle: "MONTHLY",
    description: input.descricao.slice(0, 500),
    externalReference: input.externalReference
  });
  // Primeira fatura da assinatura (link para o cliente pagar já).
  const pays = await asaas<{ data?: Array<{ invoiceUrl?: string }> }>(rt, "GET", `/subscriptions/${sub.id}/payments`).catch(() => ({ data: [] as Array<{ invoiceUrl?: string }> }));
  return { id: sub.id, invoiceUrl: pays.data?.[0]?.invoiceUrl ?? null };
}

/** Consulta o status de um pagamento (fallback do webhook). */
export async function asaasStatusPagamento(rt: AsaasRuntime, paymentId: string): Promise<string> {
  const pay = await asaas<{ status: string }>(rt, "GET", `/payments/${paymentId}`);
  return pay.status;
}

/** Link da última fatura de uma assinatura (para exibir no aviso/tela de mensalidade em atraso). */
export async function asaasLinkFaturaAssinatura(rt: AsaasRuntime, subscriptionId: string): Promise<string | null> {
  const pays = await asaas<{ data?: Array<{ invoiceUrl?: string }> }>(rt, "GET", `/subscriptions/${subscriptionId}/payments`).catch(() => ({ data: [] as Array<{ invoiceUrl?: string }> }));
  return pays.data?.[0]?.invoiceUrl ?? null;
}

/**
 * Atualiza o VALOR/descrição de uma assinatura existente (Asaas usa POST no /subscriptions/{id}).
 * `updatePendingPayments` reflete o novo valor também nas faturas já geradas e ainda em aberto —
 * assim o cliente passa a pagar o valor novo já na próxima cobrança. Devolve o link da fatura atual.
 */
export async function asaasAtualizarAssinatura(
  rt: AsaasRuntime,
  subscriptionId: string,
  input: { valor: number; descricao: string }
): Promise<{ id: string; invoiceUrl: string | null }> {
  await asaas(rt, "POST", `/subscriptions/${subscriptionId}`, {
    value: Math.round(input.valor * 100) / 100,
    description: input.descricao.slice(0, 500),
    updatePendingPayments: true
  });
  const invoiceUrl = await asaasLinkFaturaAssinatura(rt, subscriptionId);
  return { id: subscriptionId, invoiceUrl };
}

/** Registra o webhook de pagamentos no Asaas (idempotente-ish; ignora se já existir). */
export async function asaasRegistrarWebhook(rt: AsaasRuntime, url: string, token: string, email: string): Promise<void> {
  await asaas(rt, "POST", "/webhooks", {
    name: "XERP recarga creditos",
    url,
    email,
    enabled: true,
    interrupted: false,
    authToken: token,
    sendType: "SEQUENTIALLY",
    // RECEIVED/CONFIRMED liberam; OVERDUE marca inadimplência (aviso 3d / bloqueio 7d);
    // DELETED/REFUNDED limpam a mensalidade em atraso.
    events: ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED"]
  }).catch((e) => {
    // Já existe um webhook para essa URL → não é erro fatal.
    if (!/already|existe|duplicat/i.test(e instanceof Error ? e.message : "")) throw e;
  });
}

/** Salva a config de plataforma do Asaas (chave criptografada). */
export async function salvarAsaasConfig(input: {
  apiKey?: string | null;
  walletId?: string | null;
  sandbox: boolean;
  webhookToken?: string | null;
}): Promise<void> {
  const atual = await prisma.plataformaCredito.findUnique({ where: { id: "default" } });
  const apiKeyCripto = input.apiKey?.trim()
    ? encryptSecret(input.apiKey.trim())
    : atual?.asaasApiKeyCripto ?? null;
  await prisma.plataformaCredito.upsert({
    where: { id: "default" },
    update: {
      asaasApiKeyCripto: apiKeyCripto,
      asaasWalletId: input.walletId ?? atual?.asaasWalletId ?? null,
      asaasSandbox: input.sandbox,
      asaasWebhookToken: input.webhookToken ?? atual?.asaasWebhookToken ?? null
    },
    create: {
      id: "default",
      asaasApiKeyCripto: apiKeyCripto,
      asaasWalletId: input.walletId ?? null,
      asaasSandbox: input.sandbox,
      asaasWebhookToken: input.webhookToken ?? null
    }
  });
}
