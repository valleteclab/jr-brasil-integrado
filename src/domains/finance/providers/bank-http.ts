import https from "node:https";

/**
 * HTTP base compartilhado pelos provedores bancários novos (Sicredi, Itaú). Requisição HTTPS com
 * mTLS opcional (chave/cert PEM — o A1 da empresa convertido por pfxTlsOptions) e headers livres.
 */

export type BankHttpResult = { statusCode: number; body: string };

export function bankRequest(
  url: string,
  opts: { method: string; headers: Record<string, string>; tls?: { key: string; cert: string } | null; timeoutMs?: number },
  payload?: string
): Promise<BankHttpResult> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: opts.method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: opts.headers,
        ...(opts.tls ? { key: opts.tls.key, cert: opts.tls.cert } : {}),
        timeout: opts.timeoutMs ?? 30000
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("timeout", () => req.destroy(new Error(`Timeout ao chamar ${u.hostname}.`)));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export function jsonOrEmpty(body: string): Record<string, unknown> {
  try {
    const v = JSON.parse(body);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Mensagem de erro amigável de APIs padrão BACEN (RFC 7807: detail + violacoes) ou JSON genérico. */
export function parseErroBacen(banco: string, res: BankHttpResult): string {
  try {
    const data = JSON.parse(res.body) as {
      detail?: string;
      title?: string;
      message?: string;
      error_description?: string;
      violacoes?: Array<{ razao?: string; propriedade?: string }>;
      campos?: Array<{ mensagem?: string; campo?: string }>;
    };
    const viol = (data.violacoes ?? []).map((v) => `${v.propriedade ? `${v.propriedade}: ` : ""}${v.razao ?? ""}`).filter(Boolean);
    const campos = (data.campos ?? []).map((c) => `${c.campo ? `${c.campo}: ` : ""}${c.mensagem ?? ""}`).filter(Boolean);
    const partes = [data.detail ?? data.title, data.message, data.error_description, ...viol, ...campos].filter(Boolean);
    if (partes.length) return `${banco} rejeitou (HTTP ${res.statusCode}): ${partes.join("; ")}`;
  } catch { /* corpo não-JSON */ }
  return `Falha na API ${banco} (HTTP ${res.statusCode}): ${res.body.slice(0, 300)}`;
}
