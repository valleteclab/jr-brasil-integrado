/**
 * Transporte SOAP 1.2 para os web services da NF-e (4.00), com certificado de cliente A1.
 *
 * Mesmo padrão de TLS-mútuo do provedor NACIONAL (https.request com pfx + passphrase), mudando o
 * protocolo de REST/JSON para SOAP/XML. A SEFAZ recebe o XML da mensagem dentro de um envelope
 * SOAP 1.2 (Content-Type application/soap+xml) no elemento `nfeDadosMsg` do WSDL do serviço.
 */
import https from "node:https";

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

/** POST SOAP 1.2 ao endpoint com TLS-mútuo (cert A1 da empresa). */
export function postSoap(
  endpoint: string,
  envelope: string,
  cert: { pfx: Buffer; senha: string },
  timeoutMs = 20000
): Promise<SoapResponse> {
  const url = new URL(endpoint);
  const payload = Buffer.from(envelope, "utf8");
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        pfx: cert.pfx,
        passphrase: cert.senha,
        minVersion: "TLSv1.2",
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
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
