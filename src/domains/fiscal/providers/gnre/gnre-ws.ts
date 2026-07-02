import https from "node:https";
import { rootCertificates } from "node:tls";
import { ICP_BRASIL_ROOT_V10 } from "../sefaz/icp-brasil-ca";
import { pfxTlsOptions } from "../pfx-utils";

/**
 * WEBSERVICE GNRE ONLINE (Portal GNRE, SEFAZ-PE) — emissão da guia de recolhimento estadual por
 * lote XML v2.00 + consulta do resultado. SOAP 1.2 (Document/Literal) com TLS-MÚTUO usando o
 * MESMO A1 e-CNPJ da empresa (exige HABILITAÇÃO do CNPJ no portal — situação 102 sem ela).
 *
 * Fontes: Manual de Integração – Web Service de Lote v2.11 (jun/2024, docs/xsd-gnre/) e ambiente
 * oficial de TESTES www.testegnre.pe.gov.br (/gnreWS/services/GnreLoteRecepcao e /GnreResultadoLote).
 * O processamento é ASSÍNCRONO: envia o lote → recibo (10 OU 14 dígitos desde a v2.11) → consulta
 * o resultado. O manual (4.2.3) manda aguardar NO MÍNIMO 30s antes da 1ª consulta (evita 401).
 */

const ENDPOINTS = {
  PRODUCAO: {
    recepcao: "https://www.gnre.pe.gov.br/gnreWS/services/GnreLoteRecepcao",
    resultado: "https://www.gnre.pe.gov.br/gnreWS/services/GnreResultadoLote"
  },
  HOMOLOGACAO: {
    recepcao: "https://www.testegnre.pe.gov.br/gnreWS/services/GnreLoteRecepcao",
    resultado: "https://www.testegnre.pe.gov.br/gnreWS/services/GnreResultadoLote"
  }
} as const;

const GNRE_CA = [...rootCertificates, ICP_BRASIL_ROOT_V10];

export class GnreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GnreError";
  }
}

export type GnreAuth = { pfx: Buffer; senha: string };
export type GnreAmbiente = "PRODUCAO" | "HOMOLOGACAO";

// Escapes exigidos pelo manual (3.2.1-e): > < & " '
const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const dig = (v: string | null | undefined) => (v ?? "").replace(/\D+/g, "");

export type GuiaGnreInput = {
  ufFavorecida: string;
  /** Código da receita (ex.: 100048 = ICMS-ST por operação). */
  receita: string;
  /** Chave de acesso da NF-e (documento de origem). */
  chaveNfe: string;
  /** Tipo do documento de origem (tabela do portal; 2 dígitos). */
  tipoDocOrigem?: string;
  /** Código de PRODUTO da UF (obrigatório em UFs que exigem, ex.: DF/TO/PI 20 = autopeças). */
  produto?: string | null;
  /** Código de DETALHAMENTO da receita (obrigatório em UFs que exigem, ex.: TO; via GnreConfigUF). */
  detalhamento?: string | null;
  /** Campos extras exigidos pela UF (ex.: TO 106=Observação, 107=Chave da NF-e), na ordem da UF. */
  camposExtras?: { codigo: string; valor: string }[] | null;
  valor: number;
  dataVencimento: Date;
  dataPagamento: Date;
  emitente: {
    cnpj: string;
    ie?: string | null;
    razaoSocial: string;
    endereco: string;
    /** Código IBGE do município COM UF (7 dígitos) — a GNRE usa os 5 finais. */
    codigoMunicipioIbge: string;
    uf: string;
    cep?: string | null;
    telefone?: string | null;
  };
  destinatario?: { cnpj?: string | null; ie?: string | null; razaoSocial?: string | null; codigoMunicipioIbge?: string | null } | null;
};

/** Monta o lote v2.00 com UMA guia (TLote_GNRE/TDadosGNRE — ordem do exemplo oficial). */
export function buildLoteGnreXml(g: GuiaGnreInput): string {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const municipio5 = dig(g.emitente.codigoMunicipioIbge).slice(-5);
  const destMun5 = g.destinatario?.codigoMunicipioIbge ? dig(g.destinatario.codigoMunicipioIbge).slice(-5) : null;
  const competencia = g.dataPagamento;
  const dest = g.destinatario?.cnpj
    ? `<contribuinteDestinatario>` +
      `<identificacao><CNPJ>${dig(g.destinatario.cnpj)}</CNPJ>${g.destinatario.ie ? `<IE>${dig(g.destinatario.ie)}</IE>` : ""}</identificacao>` +
      (g.destinatario.razaoSocial ? `<razaoSocial>${esc(g.destinatario.razaoSocial.slice(0, 60))}</razaoSocial>` : "") +
      (destMun5 ? `<municipio>${destMun5}</municipio>` : "") +
      `</contribuinteDestinatario>`
    : "";
  return (
    `<TLote_GNRE xmlns="http://www.gnre.pe.gov.br" versao="2.00">` +
    `<guias>` +
    `<TDadosGNRE versao="2.00">` +
    `<ufFavorecida>${g.ufFavorecida.toUpperCase()}</ufFavorecida>` +
    `<tipoGnre>0</tipoGnre>` + // 0 = guia simples (uma receita/um documento)
    `<contribuinteEmitente>` +
    `<identificacao><CNPJ>${dig(g.emitente.cnpj)}</CNPJ>${g.emitente.ie ? `<IE>${dig(g.emitente.ie)}</IE>` : ""}</identificacao>` +
    `<razaoSocial>${esc(g.emitente.razaoSocial.slice(0, 60))}</razaoSocial>` +
    `<endereco>${esc(g.emitente.endereco.slice(0, 60))}</endereco>` +
    `<municipio>${municipio5}</municipio>` +
    `<uf>${g.emitente.uf.toUpperCase()}</uf>` +
    (dig(g.emitente.cep).length === 8 ? `<cep>${dig(g.emitente.cep)}</cep>` : "") +
    (dig(g.emitente.telefone).length >= 8 ? `<telefone>${dig(g.emitente.telefone).slice(0, 11)}</telefone>` : "") +
    `</contribuinteEmitente>` +
    `<itensGNRE>` +
    `<item>` +
    `<receita>${g.receita}</receita>` +
    (g.detalhamento ? `<detalhamentoReceita>${dig(g.detalhamento).padStart(6, "0")}</detalhamentoReceita>` : "") +
    `<documentoOrigem tipo="${(g.tipoDocOrigem ?? "10").padStart(2, "0")}">${dig(g.chaveNfe)}</documentoOrigem>` +
    (g.produto ? `<produto>${dig(g.produto)}</produto>` : "") +
    `<referencia><periodo>0</periodo><mes>${String(competencia.getMonth() + 1).padStart(2, "0")}</mes><ano>${competencia.getFullYear()}</ano></referencia>` +
    `<dataVencimento>${iso(g.dataVencimento)}</dataVencimento>` +
    `<valor tipo="11">${g.valor.toFixed(2)}</valor>` + // 11 = valor principal
    dest +
    (g.camposExtras?.length
      ? `<camposExtras>${g.camposExtras.map((c) => `<campoExtra><codigo>${dig(c.codigo)}</codigo><valor>${esc(c.valor.slice(0, 100))}</valor></campoExtra>`).join("")}</camposExtras>`
      : "") +
    `</item>` +
    `</itensGNRE>` +
    `<valorGNRE>${g.valor.toFixed(2)}</valorGNRE>` +
    `<dataPagamento>${iso(g.dataPagamento)}</dataPagamento>` +
    `</TDadosGNRE>` +
    `</guias>` +
    `</TLote_GNRE>`
  );
}

function soapEnvelope12(headerNs: string, body: string, versaoDados = "2.00"): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Header>` +
    `<gnreCabecMsg xmlns="${headerNs}">` +
    `<versaoDados>${versaoDados}</versaoDados>` +
    `</gnreCabecMsg>` +
    `</soap12:Header>` +
    `<soap12:Body>${body}</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

import { checkServerIdentity as tlsCheckServerIdentity } from "node:tls";

function postSoap(url: string, auth: GnreAuth, envelope: string, action: string, relaxarHostname = false): Promise<{ statusCode: number; body: string }> {
  const u = new URL(url);
  const tls = pfxTlsOptions({ pfx: auth.pfx, senha: auth.senha });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname,
        headers: {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${action}"`,
          "Content-Length": String(Buffer.byteLength(envelope))
        },
        key: tls.key,
        cert: tls.cert,
        ca: GNRE_CA,
        // O host de TESTES (testegnre.pe.gov.br) serve um certificado de *.sefaz.pe.gov.br
        // (desleixo do ambiente de homologação do governo). Só nele, aceitamos o hostname se o
        // certificado for do domínio sefaz.pe.gov.br — a cadeia continua validada normalmente.
        ...(relaxarHostname
          ? {
              checkServerIdentity: (host: string, cert: Parameters<typeof tlsCheckServerIdentity>[1]) =>
                tlsCheckServerIdentity(host, cert) === undefined
                  ? undefined
                  : tlsCheckServerIdentity("webservice.sefaz.pe.gov.br", cert)
            }
          : {}),
        timeout: 60000
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timeout ao chamar o webservice GNRE.")));
    req.on("error", reject);
    req.write(envelope);
    req.end();
  });
}

const pick = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  return m ? m[1].trim() : null;
};

/**
 * CONFIGURAÇÃO da UF (GnreConfigUF, v1.00): devolve, por UF (e opcionalmente receita), as
 * exigências — produto obrigatório e códigos válidos, tipos de documento de origem, períodos,
 * campos adicionais. É a fonte oficial para montar a guia de cada UF sem hardcode.
 */
export async function consultarConfigUf(
  auth: GnreAuth,
  ambiente: GnreAmbiente,
  uf: string,
  receita?: string | null,
  versaoDados = "2.00"
): Promise<{ statusCode: number; body: string }> {
  const ns = "http://www.gnre.pe.gov.br/webservice/GnreConfigUF";
  const consulta =
    `<TConsultaConfigUf xmlns="http://www.gnre.pe.gov.br">` +
    `<ambiente>${ambiente === "PRODUCAO" ? "1" : "2"}</ambiente>` +
    `<uf>${uf.toUpperCase()}</uf>` +
    (receita ? `<receita>${receita}</receita>` : "") +
    `</TConsultaConfigUf>`;
  const body = `<gnreDadosMsg xmlns="${ns}">${consulta}</gnreDadosMsg>`;
  const url = ENDPOINTS[ambiente].recepcao.replace("GnreLoteRecepcao", "GnreConfigUF");
  return postSoap(url, auth, soapEnvelope12(ns, body, versaoDados), `${ns}/consultar`, ambiente === "HOMOLOGACAO");
}

/** Envia o lote e devolve o número do RECIBO (processamento assíncrono). */
export async function enviarLoteGnre(auth: GnreAuth, ambiente: GnreAmbiente, loteXml: string): Promise<string> {
  const ns = "http://www.gnre.pe.gov.br/webservice/GnreLoteRecepcao";
  const body = `<gnreDadosMsg xmlns="${ns}">${loteXml}</gnreDadosMsg>`;
  const res = await postSoap(ENDPOINTS[ambiente].recepcao, auth, soapEnvelope12(ns, body), `${ns}/processar`, ambiente === "HOMOLOGACAO");
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new GnreError(`GNRE recepção HTTP ${res.statusCode}: ${res.body.slice(0, 400)}`);
  }
  const recibo = pick(res.body, "numero");
  const situacao = pick(res.body, "codigo");
  const descricao = pick(res.body, "descricao");
  if (!recibo) {
    throw new GnreError(`GNRE não devolveu recibo (situação ${situacao ?? "?"}: ${descricao ?? res.body.slice(0, 300)}).`);
  }
  return recibo;
}

export type ResultadoGnre = {
  /** Código da situação do processamento do LOTE (ex.: 402 = processado com sucesso). */
  situacao: string | null;
  descricaoSituacao: string | null;
  /** Situação da GUIA dentro do lote (0 = processada com sucesso). */
  situacaoGuia: string | null;
  /** Linha digitável da guia (XSD: linhaDigitavel). */
  representacaoNumerica: string | null;
  codigoBarras: string | null;
  nossoNumero: string | null;
  /** PDF da(s) guia(s) em base64 (XSD: pdfGuias). */
  pdfBase64: string | null;
  /** Motivos de rejeição/pendência, quando houver. */
  erros: string[];
  bruto: string;
};

/** Consulta o resultado do lote. `incluirPdf` pede o PDF das guias (consulta mais LENTA — o
 * manual manda usar só quando necessário; no poll use false e faça UMA consulta final com true). */
export async function consultarResultadoGnre(auth: GnreAuth, ambiente: GnreAmbiente, recibo: string, incluirPdf = false, incluirNoticias = false): Promise<ResultadoGnre> {
  // XSD oficial v2.11 (docs/xsd-gnre/lote_gnre_consulta_v1.00.xsd): TConsLote_GNRE NÃO tem
  // atributo "versao" (incluí-lo derruba a consulta com 501); incluirPDFGuias é opcional e sem
  // ele o portal NUNCA devolve o pdfGuias.
  const consulta =
    `<TConsLote_GNRE xmlns="http://www.gnre.pe.gov.br">` +
    `<ambiente>${ambiente === "PRODUCAO" ? "1" : "2"}</ambiente>` +
    `<numeroRecibo>${recibo}</numeroRecibo>` +
    (incluirPdf ? `<incluirPDFGuias>S</incluirPDFGuias>` : "") +
    (incluirNoticias ? `<incluirNoticias>S</incluirNoticias>` : "") +
    `</TConsLote_GNRE>`;
  const ns = "http://www.gnre.pe.gov.br/webservice/GnreResultadoLote";
  const body = `<gnreDadosMsg xmlns="${ns}">${consulta}</gnreDadosMsg>`;
  const res = await postSoap(ENDPOINTS[ambiente].resultado, auth, soapEnvelope12(ns, body), `${ns}/consultar`, ambiente === "HOMOLOGACAO");
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new GnreError(`GNRE resultado HTTP ${res.statusCode}: ${res.body.slice(0, 400)}`);
  }
  const xml = res.body;
  const erros: string[] = [];
  // Motivos de rejeição vêm em <motivosRejeicao><motivo><codigo>/<descricao> (por guia).
  const motivos = xml.match(/<(?:\w+:)?motivo>[\s\S]*?<\/(?:\w+:)?motivo>/g) ?? [];
  for (const m of motivos) {
    const cod = pick(m, "codigo");
    const desc = pick(m, "descricao");
    if (desc) erros.push(`${cod ? `${cod}: ` : ""}${desc}`);
  }
  // situacaoProcess do LOTE: pega o codigo/descricao DENTRO do bloco (evita casar com motivos).
  const blocoSituacao = xml.match(/<(?:\w+:)?situacaoProcess>[\s\S]*?<\/(?:\w+:)?situacaoProcess>/)?.[0] ?? xml;
  return {
    situacao: pick(blocoSituacao, "codigo"),
    descricaoSituacao: pick(blocoSituacao, "descricao"),
    situacaoGuia: pick(xml, "situacaoGuia"),
    representacaoNumerica: pick(xml, "linhaDigitavel"),
    codigoBarras: pick(xml, "codigoBarras"),
    nossoNumero: pick(xml, "nossoNumero"),
    pdfBase64: pick(xml, "pdfGuias"),
    erros,
    bruto: xml
  };
}
