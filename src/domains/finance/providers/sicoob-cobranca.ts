import https from "node:https";
import { pfxTlsOptions } from "@/domains/fiscal/providers/pfx-utils";

/**
 * Cliente da API de COBRANÇA BANCÁRIA do Sicoob (v3) — registro/consulta de boletos.
 *
 * Autenticação:
 *  - PRODUÇÃO: OAuth2 client_credentials em auth.sicoob.com.br, com mTLS usando o certificado
 *    ICP-Brasil e-CNPJ A1 da empresa (o MESMO A1 já guardado para o fiscal) + client_id do
 *    credenciamento "Sicoob Desenvolvedores".
 *  - SANDBOX: token Bearer fixo do portal dev (sem mTLS) — permite testar sem credenciamento.
 *
 * Referência: developers.sicoob.com.br (Cobrança Bancária v3).
 */

const PROD_AUTH_URL = "https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token";
const PROD_API_BASE = "https://api.sicoob.com.br/cobranca-bancaria/v3";
const SANDBOX_API_BASE = "https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3";

const SCOPES = "boletos_inclusao boletos_consulta boletos_alteracao";

export class SicoobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SicoobError";
  }
}

export type SicoobAuth = {
  sandbox: boolean;
  clientId?: string | null;
  /** Token do portal (sandbox). */
  sandboxToken?: string | null;
  /** A1 da empresa para o mTLS de produção. */
  certificado?: { pfx: Buffer; senha: string } | null;
};

type HttpResult = { statusCode: number; body: string };

function request(
  url: string,
  opts: { method: string; headers: Record<string, string>; tls?: { key: string; cert: string } | null },
  payload?: string
): Promise<HttpResult> {
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
        timeout: 30000
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timeout ao chamar a API do Sicoob.")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Obtém o access token (produção: client_credentials + mTLS; sandbox: token do portal direto). */
async function getAccessToken(auth: SicoobAuth): Promise<{ token: string; tls: { key: string; cert: string } | null }> {
  if (auth.sandbox) {
    const token = auth.sandboxToken?.trim();
    if (!token) throw new SicoobError("Informe o token de sandbox do portal Sicoob Desenvolvedores na conta bancária.");
    return { token, tls: null };
  }
  if (!auth.clientId?.trim()) throw new SicoobError("Informe o client_id do credenciamento Sicoob na conta bancária.");
  if (!auth.certificado?.pfx) throw new SicoobError("Certificado A1 da empresa não disponível para o mTLS do Sicoob.");
  const tls = pfxTlsOptions(auth.certificado);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: auth.clientId.trim(),
    scope: SCOPES
  }).toString();
  const res = await request(PROD_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": String(Buffer.byteLength(body)) },
    tls
  }, body);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new SicoobError(`Falha na autenticação Sicoob (HTTP ${res.statusCode}): ${res.body.slice(0, 300)}`);
  }
  const token = (JSON.parse(res.body) as { access_token?: string }).access_token;
  if (!token) throw new SicoobError("Autenticação Sicoob não retornou access_token.");
  return { token, tls };
}

async function api(auth: SicoobAuth, method: string, path: string, payload?: unknown): Promise<HttpResult> {
  const { token, tls } = await getAccessToken(auth);
  const base = auth.sandbox ? SANDBOX_API_BASE : PROD_API_BASE;
  const body = payload !== undefined ? JSON.stringify(payload) : undefined;
  return request(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(auth.sandbox && auth.clientId ? { client_id: auth.clientId } : {}),
      ...(body ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) } : {})
    },
    tls
  }, body);
}

export type IncluirBoletoInput = {
  numeroCliente: number;
  codigoModalidade: number;
  numeroContaCorrente?: number;
  seuNumero: string;
  valor: number;
  dataVencimento: string; // YYYY-MM-DD
  dataEmissao: string; // YYYY-MM-DD
  pagador: {
    numeroCpfCnpj: string;
    nome: string;
    endereco: string;
    bairro: string;
    cidade: string;
    cep: string;
    uf: string;
    email?: string;
  };
  mensagensInstrucao?: string[];
};

export type BoletoRegistrado = {
  nossoNumero: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  pdfBase64: string | null;
  bruto: unknown;
};

/** Registra um boleto (espécie DM — duplicata mercantil, aceite N, PDF incluso). */
export async function incluirBoleto(auth: SicoobAuth, input: IncluirBoletoInput): Promise<BoletoRegistrado> {
  // Campos obrigatórios confirmados contra o schema do sandbox (400 sem eles): numeroContaCorrente
  // (sempre, 0 quando não configurada), tipoDesconto/tipoMulta (0 = sem), tipoJurosMora (3 = isento)
  // e numeroParcela (1 = título único).
  const payload = {
    numeroCliente: input.numeroCliente,
    codigoModalidade: input.codigoModalidade,
    numeroContaCorrente: input.numeroContaCorrente ?? 0,
    codigoEspecieDocumento: "DM",
    dataEmissao: input.dataEmissao,
    seuNumero: input.seuNumero,
    identificacaoEmissaoBoleto: 1, // banco emite (nosso número gerado pelo Sicoob)
    identificacaoDistribuicaoBoleto: 1,
    valor: input.valor,
    dataVencimento: input.dataVencimento,
    tipoDesconto: 0,
    tipoMulta: 0,
    tipoJurosMora: 3,
    numeroParcela: 1,
    aceite: false,
    gerarPdf: true,
    pagador: input.pagador,
    ...(input.mensagensInstrucao?.length ? { mensagensInstrucao: input.mensagensInstrucao.slice(0, 5) } : {})
  };
  const res = await api(auth, "POST", "/boletos", payload);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new SicoobError(parseErro(res));
  }
  let data: unknown = {};
  try { data = JSON.parse(res.body); } catch { /* corpo vazio */ }
  // v3 devolve { resultado: {...} }; versões/sandbox podem devolver o objeto direto ou em array.
  const raiz = (data as { resultado?: unknown }).resultado ?? data;
  const boleto = Array.isArray(raiz) ? raiz[0] : raiz;
  const b = (boleto ?? {}) as Record<string, unknown>;
  return {
    nossoNumero: b.nossoNumero != null ? String(b.nossoNumero) : null,
    linhaDigitavel: (b.linhaDigitavel as string) ?? null,
    codigoBarras: (b.codigoBarras as string) ?? null,
    pdfBase64: (b.pdfBoleto as string) ?? null,
    bruto: boleto ?? data
  };
}

export type BoletoConsulta = {
  situacao: string | null;
  valorPago: number | null;
  dataPagamento: string | null;
  bruto: unknown;
};

/** Consulta um boleto pelo nosso número (situação: EM ABERTO / LIQUIDADO / BAIXADO...). */
export async function consultarBoleto(
  auth: SicoobAuth,
  params: { numeroCliente: number; codigoModalidade: number; nossoNumero: string }
): Promise<BoletoConsulta> {
  const qs = new URLSearchParams({
    numeroCliente: String(params.numeroCliente),
    codigoModalidade: String(params.codigoModalidade),
    nossoNumero: params.nossoNumero
  }).toString();
  const res = await api(auth, "GET", `/boletos?${qs}`);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new SicoobError(parseErro(res));
  }
  let data: unknown = {};
  try { data = JSON.parse(res.body); } catch { /* vazio */ }
  const raiz = (data as { resultado?: unknown }).resultado ?? data;
  const boleto = Array.isArray(raiz) ? raiz[0] : raiz;
  const b = (boleto ?? {}) as Record<string, unknown>;
  return {
    situacao: (b.situacaoBoleto as string) ?? (b.situacao as string) ?? null,
    valorPago: b.valorTotalRecebimento != null ? Number(b.valorTotalRecebimento) : null,
    dataPagamento: (b.dataLiquidacao as string) ?? null,
    bruto: boleto ?? data
  };
}

function parseErro(res: HttpResult): string {
  try {
    const data = JSON.parse(res.body) as { mensagens?: Array<{ mensagem?: string; codigo?: string }>; message?: string };
    const msgs = (data.mensagens ?? []).map((m) => `${m.codigo ? `${m.codigo}: ` : ""}${m.mensagem ?? ""}`).filter(Boolean);
    if (msgs.length) return `Sicoob rejeitou (HTTP ${res.statusCode}): ${msgs.join("; ")}`;
    if (data.message) return `Sicoob (HTTP ${res.statusCode}): ${data.message}`;
  } catch { /* corpo não-JSON */ }
  return `Falha na API do Sicoob (HTTP ${res.statusCode}): ${res.body.slice(0, 300)}`;
}
