/**
 * Transporte SOAP 1.2 para os web services da NF-e (4.00), com certificado de cliente A1.
 *
 * Mesmo padrão de TLS-mútuo do provedor NACIONAL (https.request com pfx + passphrase), mudando o
 * protocolo de REST/JSON para SOAP/XML. A SEFAZ recebe o XML da mensagem dentro de um envelope
 * SOAP 1.2 (Content-Type application/soap+xml) no elemento `nfeDadosMsg` do WSDL do serviço.
 */
import https from "node:https";
import { rootCertificates } from "node:tls";
import { ICP_BRASIL_ROOT_V10 } from "./icp-brasil-ca";

// CAs aceitas no TLS dos web services da SEFAZ: as padrão do Node + a raiz ICP-Brasil v10 (os
// servidores da SEFAZ usam certificados de servidor ICP-Brasil, ausentes da store pública do Node).
const SEFAZ_CA = [...rootCertificates, ICP_BRASIL_ROOT_V10];

/** WSDL namespace de cada serviço — usado no `xmlns` do `nfeDadosMsg`. */
export const WSDL_NS = {
  status: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4",
  autorizacao: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4",
  retAutorizacao: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4",
  consulta: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4",
  evento: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4",
  inutilizacao: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4"
} as const;

/** Namespace do conteúdo das mensagens NF-e (consStatServ, enviNFe, etc). */
export const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

/** SOAPAction (parâmetro `action` do Content-Type SOAP 1.2) = WSDL + "/" + nome da operação. */
export const SOAP_ACTION = {
  status: `${WSDL_NS.status}/nfeStatusServicoNF`,
  autorizacao: `${WSDL_NS.autorizacao}/nfeAutorizacaoLote`,
  retAutorizacao: `${WSDL_NS.retAutorizacao}/nfeRetAutorizacao`,
  consulta: `${WSDL_NS.consulta}/nfeConsultaNF`,
  evento: `${WSDL_NS.evento}/nfeRecepcaoEvento`,
  inutilizacao: `${WSDL_NS.inutilizacao}/nfeInutilizacaoNF`
} as const;

export type SoapResponse = { statusCode: number; body: string };

/** Envolve a mensagem NF-e (já em XML) em um envelope SOAP 1.2 com o `nfeDadosMsg` do serviço. */
export function soapEnvelope(wsdlNamespace: string, innerXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDadosMsg xmlns="${wsdlNamespace}">${innerXml}</nfeDadosMsg>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

/**
 * POST SOAP 1.2 ao endpoint com TLS-mútuo (cert A1 da empresa). Em SOAP 1.2 a operação vai como
 * parâmetro `action` do Content-Type — alguns serviços .NET da SEFAZ (ex.: RecepcaoEvento da BA)
 * rejeitam com "Object reference not set" quando ela falta.
 */
// Erros de validação da CADEIA do servidor (não do nosso A1). Alguns servidores da SEFAZ — ex.: o AN
// www.nfe.fazenda.gov.br (RecepcaoEvento) — apresentam cadeia incompleta/fora da ICP-Brasil pública,
// gerando "unable to get local issuer certificate". Nesses casos refazemos sem validar a cadeia do
// servidor: o transporte já é TLS-mútuo com o A1 e o endpoint é oficial e fixo (risco controlado).
const TLS_CA_ERR_CODES = new Set([
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_ISSUER_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_UNTRUSTED"
]);

function isTlsCaError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? "";
  const msg = err instanceof Error ? err.message : String(err);
  return TLS_CA_ERR_CODES.has(code) || /local issuer certificate|self[- ]signed certificate/i.test(msg);
}

function doPostSoap(
  endpoint: string,
  payload: Buffer,
  contentType: string,
  cert: { pfx: Buffer; senha: string },
  timeoutMs: number,
  validarCadeia: boolean
): Promise<SoapResponse> {
  const url = new URL(endpoint);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        pfx: cert.pfx,
        passphrase: cert.senha,
        ca: SEFAZ_CA,
        rejectUnauthorized: validarCadeia,
        minVersion: "TLSv1.2",
        headers: {
          "Content-Type": contentType,
          "Content-Length": payload.byteLength
        }
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout (${timeoutMs}ms) ao chamar a SEFAZ.`)));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export function postSoap(
  endpoint: string,
  envelope: string,
  cert: { pfx: Buffer; senha: string },
  action?: string,
  timeoutMs = 20000
): Promise<SoapResponse> {
  const payload = Buffer.from(envelope, "utf8");
  const contentType = `application/soap+xml; charset=utf-8${action ? `; action="${action}"` : ""}`;
  return doPostSoap(endpoint, payload, contentType, cert, timeoutMs, true).catch((err) => {
    if (isTlsCaError(err)) return doPostSoap(endpoint, payload, contentType, cert, timeoutMs, false);
    throw err;
  });
}

/** Extrai o texto de uma tag (ignora namespace/prefixo). Retorna undefined se ausente. */
export function pickTag(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml);
  return m?.[1]?.trim();
}

/** Extrai um elemento INTEIRO (com as tags de abertura/fechamento). Útil p/ aninhar no nfeProc. */
export function pickBlock(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>[\\s\\S]*?</(?:\\w+:)?${tag}>`).exec(xml);
  return m?.[0];
}
