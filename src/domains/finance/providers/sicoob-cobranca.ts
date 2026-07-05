import { type HttpResult, type SicoobAuth, SicoobError, parseErroSicoob, sicoobApi } from "./sicoob-http";

/**
 * Cliente da API de COBRANÇA BANCÁRIA do Sicoob (v3) — registro/consulta/gestão de boletos
 * e webhooks de movimento. HTTP/autenticação em ./sicoob-http (compartilhado com Pix e Conta).
 *
 * Referência: developers.sicoob.com.br (Cobrança Bancária v3).
 */

export { SicoobError, type SicoobAuth } from "./sicoob-http";

const COBRANCA = {
  prodBase: "https://api.sicoob.com.br/cobranca-bancaria/v3",
  sandboxBase: "https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3",
  scopes: "boletos_inclusao boletos_consulta boletos_alteracao webhooks_inclusao webhooks_consulta webhooks_alteracao"
};

function api(auth: SicoobAuth, method: string, path: string, payload?: unknown): Promise<HttpResult> {
  return sicoobApi(auth, COBRANCA, method, path, payload);
}

/** DIAGNÓSTICO (rota sicoob-teste): chamada crua na API de cobrança — devolve status+corpo brutos. */
export function chamadaCobrancaCrua(auth: SicoobAuth, method: string, path: string, payload?: unknown): Promise<HttpResult> {
  return api(auth, method, path, payload);
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

/** Baixa (cancela) um boleto registrado no banco — para de ser cobrado/pagável. */
export async function baixarBoleto(
  auth: SicoobAuth,
  params: { numeroCliente: number; codigoModalidade: number; nossoNumero: string }
): Promise<void> {
  const res = await api(auth, "PATCH", `/boletos/${params.nossoNumero}/baixar`, {
    numeroCliente: params.numeroCliente,
    codigoModalidade: params.codigoModalidade
  });
  if (res.statusCode < 200 || res.statusCode >= 300) throw new SicoobError(parseErro(res));
}

/** Prorroga o vencimento de um boleto já registrado (grupo prorrogacaoVencimento do PATCH v3). */
export async function prorrogarVencimentoBoleto(
  auth: SicoobAuth,
  params: { numeroCliente: number; codigoModalidade: number; nossoNumero: string; dataVencimento: string }
): Promise<void> {
  const res = await api(auth, "PATCH", `/boletos/${params.nossoNumero}`, {
    numeroCliente: params.numeroCliente,
    codigoModalidade: params.codigoModalidade,
    prorrogacaoVencimento: { dataVencimento: params.dataVencimento }
  });
  if (res.statusCode < 200 || res.statusCode >= 300) throw new SicoobError(parseErro(res));
}

export type WebhookCobranca = {
  idWebhook: number;
  url: string | null;
  codigoTipoMovimento: number | null;
  codigoSituacao: number | null;
  descricaoSituacao: string | null;
};

/**
 * Cadastra o webhook de movimento da cobrança. Tipo 7 = Pagamento (baixa operacional): o Sicoob
 * chama a URL quando um boleto liquida. codigoPeriodoMovimento 1 = movimento do dia (D0).
 */
export async function cadastrarWebhookCobranca(
  auth: SicoobAuth,
  params: { url: string; email: string; codigoTipoMovimento?: number }
): Promise<number> {
  const res = await api(auth, "POST", "/webhooks", {
    url: params.url,
    email: params.email,
    codigoTipoMovimento: params.codigoTipoMovimento ?? 7,
    codigoPeriodoMovimento: 1
  });
  if (res.statusCode < 200 || res.statusCode >= 300) throw new SicoobError(parseErro(res));
  let data: unknown = {};
  try { data = JSON.parse(res.body); } catch { /* vazio */ }
  const id = ((data as { resultado?: { idWebhook?: number } }).resultado ?? {}).idWebhook;
  if (id == null) throw new SicoobError("Cadastro do webhook Sicoob não retornou idWebhook.");
  return Number(id);
}

/** Lista os webhooks cadastrados (situação 3 = validado com sucesso). */
export async function consultarWebhooksCobranca(auth: SicoobAuth, codigoTipoMovimento = 7): Promise<WebhookCobranca[]> {
  const res = await api(auth, "GET", `/webhooks?codigoTipoMovimento=${codigoTipoMovimento}`);
  if (res.statusCode < 200 || res.statusCode >= 300) throw new SicoobError(parseErro(res));
  let data: unknown = {};
  try { data = JSON.parse(res.body); } catch { /* vazio */ }
  const lista = (data as { resultado?: unknown }).resultado;
  return (Array.isArray(lista) ? lista : []).map((w) => {
    const r = w as Record<string, unknown>;
    return {
      idWebhook: Number(r.idWebhook),
      url: (r.url as string) ?? null,
      codigoTipoMovimento: r.codigoTipoMovimento != null ? Number(r.codigoTipoMovimento) : null,
      codigoSituacao: r.codigoSituacao != null ? Number(r.codigoSituacao) : null,
      descricaoSituacao: (r.descricaoSituacao as string) ?? null
    };
  });
}

const parseErro = parseErroSicoob;
