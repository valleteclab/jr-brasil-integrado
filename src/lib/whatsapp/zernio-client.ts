/**
 * Cliente da Zernio (https://docs.zernio.com) — camada sobre a API OFICIAL da Meta
 * (WhatsApp Business Account/WABA). Regras herdadas da Meta:
 *  - Conversa iniciada PELA EMPRESA exige TEMPLATE aprovado (POST /inbox/conversations com
 *    templateName/templateLanguage/templateParams e o telefone em participantId).
 *  - Mensagem LIVRE (texto/PDF) só dentro da janela de 24h após a última mensagem DO CLIENTE
 *    (POST /inbox/conversations/{id}/messages).
 * A API key (sk_...) fica criptografada em ConfiguracaoWhatsapp.tokenCripto. Nunca logar.
 */

const ZERNIO_BASE = "https://zernio.com/api/v1";

export type ZernioCredentials = {
  apiKey: string;
  /** ID da conta WhatsApp (WABA) conectada na Zernio (accounts._id). */
  accountId: string;
  /** Template aprovado na Meta para iniciar conversa — corpo com {{1}} recebendo a mensagem. */
  templateNome: string | null;
  templateIdioma: string | null;
};

type ZernioResult = { ok: boolean; error?: string };

function headers(apiKey: string, json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

async function readError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  return `Zernio HTTP ${res.status}${raw ? ` ${raw.slice(0, 200)}` : ""}`;
}

/**
 * Parâmetro de template da Meta não aceita quebras de linha/tabs — achata a mensagem
 * multi-linha em uma linha (separador " — ") e limita o tamanho.
 */
export function sanitizarParametroTemplate(texto: string, max = 900): string {
  const plano = texto
    .replace(/[*_~]/g, "")
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" — ")
    .replace(/\s{4,}/g, " ");
  return plano.length > max ? `${plano.slice(0, max - 1)}…` : plano;
}

/**
 * Abre (ou reaproveita) a conversa com o telefone enviando o TEMPLATE aprovado.
 * É o único jeito permitido pela Meta de falar com o cliente fora da janela de 24h.
 */
export async function zernioAbrirConversaComTemplate(
  cred: ZernioCredentials,
  phone: string,
  templateParams: string[]
): Promise<ZernioResult & { conversationId?: string }> {
  if (!cred.templateNome) {
    return {
      ok: false,
      error: "Configure o template aprovado da Meta (Configurações → WhatsApp) — a API oficial exige template para iniciar conversa."
    };
  }
  try {
    const res = await fetch(`${ZERNIO_BASE}/inbox/conversations`, {
      method: "POST",
      headers: headers(cred.apiKey),
      body: JSON.stringify({
        accountId: cred.accountId,
        participantId: phone.replace(/\D/g, ""),
        templateName: cred.templateNome,
        templateLanguage: cred.templateIdioma || "pt_BR",
        templateParams: templateParams.map((p) => sanitizarParametroTemplate(p))
      })
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // Formato defensivo: a doc não fixa o envelope do id da conversa.
    const conversa = (data.conversation ?? data.data ?? data) as Record<string, unknown>;
    const conversationId =
      (typeof conversa.id === "string" && conversa.id) ||
      (typeof conversa._id === "string" && conversa._id) ||
      (typeof data.conversationId === "string" && data.conversationId) ||
      undefined;
    return { ok: true, conversationId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede ao enviar WhatsApp (Zernio)." };
  }
}

/**
 * Envia mensagem LIVRE (texto e/ou documento PDF) numa conversa existente — só funciona com a
 * janela de 24h aberta (cliente respondeu). Documento vai em multipart (binário, sem URL pública).
 */
export async function zernioEnviarMensagemLivre(
  cred: ZernioCredentials,
  conversationId: string,
  params: { message?: string; pdf?: { buffer: Buffer; fileName: string } }
): Promise<ZernioResult> {
  try {
    let res: Response;
    if (params.pdf) {
      const form = new FormData();
      form.append("accountId", cred.accountId);
      if (params.message) form.append("message", params.message);
      form.append(
        "attachment",
        new Blob([new Uint8Array(params.pdf.buffer)], { type: "application/pdf" }),
        params.pdf.fileName
      );
      res = await fetch(`${ZERNIO_BASE}/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: headers(cred.apiKey, false),
        body: form
      });
    } else {
      res = await fetch(`${ZERNIO_BASE}/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: headers(cred.apiKey),
        body: JSON.stringify({ accountId: cred.accountId, message: params.message ?? "" })
      });
    }
    if (!res.ok) return { ok: false, error: await readError(res) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha de rede ao enviar WhatsApp (Zernio)." };
  }
}

/** Contas de rede social conectadas na Zernio (para o setup escolher a conta WhatsApp). */
export async function zernioListarContas(apiKey: string): Promise<{ ok: boolean; error?: string; contas: Array<{ id: string; platform: string; nome: string }> }> {
  try {
    const res = await fetch(`${ZERNIO_BASE}/accounts`, { headers: headers(apiKey, false) });
    if (!res.ok) return { ok: false, error: await readError(res), contas: [] };
    const data = (await res.json().catch(() => ({}))) as { accounts?: Array<Record<string, unknown>> };
    const contas = (data.accounts ?? []).map((a) => ({
      id: String(a._id ?? a.id ?? ""),
      platform: String(a.platform ?? ""),
      nome: String(a.name ?? a.username ?? a.displayName ?? a._id ?? "")
    })).filter((a) => a.id);
    return { ok: true, contas };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao consultar a Zernio.", contas: [] };
  }
}

/** Templates da WABA associada à conta (só APPROVED servem para iniciar conversa). */
export async function zernioListarTemplates(apiKey: string, accountId: string): Promise<{ ok: boolean; error?: string; templates: Array<{ nome: string; idioma: string; status: string; categoria: string }> }> {
  try {
    const res = await fetch(`${ZERNIO_BASE}/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`, {
      headers: headers(apiKey, false)
    });
    if (!res.ok) return { ok: false, error: await readError(res), templates: [] };
    const data = (await res.json().catch(() => ({}))) as { templates?: Array<Record<string, unknown>> };
    const templates = (data.templates ?? []).map((t) => ({
      nome: String(t.name ?? ""),
      idioma: String(t.language ?? ""),
      status: String(t.status ?? ""),
      categoria: String(t.category ?? "")
    })).filter((t) => t.nome);
    return { ok: true, templates };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao consultar a Zernio.", templates: [] };
  }
}
