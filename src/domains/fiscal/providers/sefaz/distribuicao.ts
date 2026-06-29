/**
 * Distribuição de DF-e (NFeDistribuicaoDFe) DIRETO no Ambiente Nacional (AN) da SEFAZ.
 *
 * Diferente dos demais serviços (autorização/eventos/consulta), a distribuição é NACIONAL: a empresa
 * baixa de um único endereço (AN) todos os documentos de seu interesse — NF-e em que é destinatária,
 * resumos, eventos — paginados por NSU (Número Sequencial Único). O cliente guarda o último NSU
 * baixado (ultNSU) e pede o próximo lote; quando ultNSU == maxNSU não há novidades.
 *
 * Particularidades atendidas aqui:
 *  - Envelope SOAP DIFERENTE: o corpo é `<nfeDistDFeInteresse><nfeDadosMsg>{distDFeInt}</nfeDadosMsg>
 *    </nfeDistDFeInteresse>` (e NÃO o nfeDadosMsg "solto" do soapEnvelope padrão). Por isso o
 *    envelope soap12 é montado inline aqui, reaproveitando só o transporte postSoap (TLS-mútuo com A1).
 *  - A resposta traz um `<loteDistDFeInt>` com vários `<docZip>` em base64(gzip(xml)); cada um é
 *    descompactado com node:zlib.gunzipSync.
 *
 * Versão do leiaute do distDFeInt: "1.35" (schema distDFeInt_v1.35.xsd, MOC/NT 2014.002 da
 * NFeDistribuicaoDFe). Obs.: o sped-nfe registra "1.01" no JSON de serviços, mas esse é o número da
 * versão do WS (WSDL), não do XML da mensagem — o `versao` do distDFeInt é 1.35.
 */
import { gunzipSync } from "node:zlib";
import type { AmbienteFiscal } from "@prisma/client";
import { AN_DISTRIBUICAO } from "./endpoints";
import { NFE_NS, pickTag, postSoap } from "./soap";

/** Versão do leiaute da mensagem distDFeInt (atributo `versao`). */
const DIST_VERSAO = "1.35";

/** Namespace do WSDL do NFeDistribuicaoDFe (usado no nfeDistDFeInteresse/nfeDadosMsg). */
const DIST_WSDL_NS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";

const onlyDigits = (s: string | number | null | undefined) => String(s ?? "").replace(/\D/g, "");

const tpAmbDe = (ambiente: AmbienteFiscal) => (ambiente === "PRODUCAO" ? "1" : "2");

export type DistDoc = {
  nsu: string;
  schema: string;
  tipo: "resumoNFe" | "nfeCompleta" | "resumoEvento" | "eventoCompleto" | "outro";
  chaveAcesso?: string;
  xml: string; // XML já descompactado
  emitenteDocumento?: string;
  emitenteNome?: string;
  valorNfe?: number;
  dataEmissao?: string; // ISO
  tipoNfe?: number; // tpNF do resumo (0=entrada,1=saida)
  numeroProtocolo?: string;
  tipoEvento?: string;
};

export type DistResult = {
  cStat: string;
  xMotivo: string;
  ultNSU: string;
  maxNSU: string;
  docs: DistDoc[];
  raw: string;
  statusCode: number;
};

/**
 * Envelope SOAP 1.2 específico da Distribuição. NÃO usa soapEnvelope() (que envolve só o
 * nfeDadosMsg); aqui o corpo é nfeDistDFeInteresse > nfeDadosMsg > distDFeInt.
 */
function distEnvelope(distDFeInt: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDistDFeInteresse xmlns="${DIST_WSDL_NS}">` +
    `<nfeDadosMsg>${distDFeInt}</nfeDadosMsg>` +
    `</nfeDistDFeInteresse>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

/** Monta o distDFeInt com a consulta já pronta (distNSU OU consChNFe). */
function buildDistDFeInt(params: {
  ambiente: AmbienteFiscal;
  cUFAutor: string;
  cnpj: string;
  consulta: string;
}): string {
  return (
    `<distDFeInt versao="${DIST_VERSAO}" xmlns="${NFE_NS}">` +
    `<tpAmb>${tpAmbDe(params.ambiente)}</tpAmb>` +
    `<cUFAutor>${onlyDigits(params.cUFAutor)}</cUFAutor>` +
    `<CNPJ>${onlyDigits(params.cnpj)}</CNPJ>` +
    params.consulta +
    `</distDFeInt>`
  );
}

/** Extrai um número (vNF) tolerando vírgula/ponto; undefined se ausente/ inválido. */
function parseNumero(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Classifica e enriquece um docZip já descompactado em DistDoc, conforme o schema/raiz:
 *  - resNFe        → resumo de NF-e (chave, emitente, vNF, dhEmi, tpNF, cSitNFe, dhRecbto)
 *  - procNFe/nfeProc → NF-e completa (chave via Id do infNFe, nProt)
 *  - resEvento     → resumo de evento (chave + tpEvento)
 *  - procEventoNFe → evento completo (chave + tpEvento)
 */
function classificarDoc(nsu: string, schema: string, xml: string): DistDoc {
  const base: DistDoc = { nsu, schema, tipo: "outro", xml };
  const s = schema.toLowerCase();

  // Resumo de NF-e
  if (s.includes("resnfe") || /<resNFe[\s>]/.test(xml)) {
    return {
      ...base,
      tipo: "resumoNFe",
      chaveAcesso: pickTag(xml, "chNFe"),
      emitenteDocumento: pickTag(xml, "CNPJ") ?? pickTag(xml, "CPF"),
      emitenteNome: pickTag(xml, "xNome"),
      valorNfe: parseNumero(pickTag(xml, "vNF")),
      dataEmissao: pickTag(xml, "dhEmi"),
      tipoNfe: (() => {
        const t = pickTag(xml, "tpNF");
        return t !== undefined && t !== "" ? Number(t) : undefined;
      })()
    };
  }

  // NF-e completa (procNFe é a raiz no docZip; nfeProc é o equivalente quando salvo em arquivo)
  if (s.includes("procnfe") || /<procNFe[\s>]/.test(xml) || /<nfeProc[\s>]/.test(xml)) {
    // chave = Id do infNFe ("NFe" + 44 dígitos)
    const id = /<infNFe[^>]*\bId="([^"]+)"/.exec(xml)?.[1];
    const chave = id ? onlyDigits(id) : pickTag(xml, "chNFe");
    // No XML completo o <emit> vem antes do <dest>, então a 1ª ocorrência de xNome/CNPJ é a do
    // emitente; dhEmi está só no <ide> e vNF só no <total><ICMSTot>.
    return {
      ...base,
      tipo: "nfeCompleta",
      chaveAcesso: chave || undefined,
      numeroProtocolo: pickTag(xml, "nProt"),
      dataEmissao: pickTag(xml, "dhEmi") ?? pickTag(xml, "dEmi"),
      emitenteNome: pickTag(xml, "xNome"),
      emitenteDocumento: pickTag(xml, "CNPJ") ?? pickTag(xml, "CPF"),
      valorNfe: parseNumero(pickTag(xml, "vNF"))
    };
  }

  // Resumo de evento
  if (s.includes("resevento") || /<resEvento[\s>]/.test(xml)) {
    return {
      ...base,
      tipo: "resumoEvento",
      chaveAcesso: pickTag(xml, "chNFe"),
      tipoEvento: pickTag(xml, "tpEvento")
    };
  }

  // Evento completo
  if (s.includes("procevento") || /<procEventoNFe[\s>]/.test(xml)) {
    return {
      ...base,
      tipo: "eventoCompleto",
      chaveAcesso: pickTag(xml, "chNFe"),
      tipoEvento: pickTag(xml, "tpEvento"),
      numeroProtocolo: pickTag(xml, "nProt")
    };
  }

  return base;
}

/**
 * Extrai e descompacta todos os `<docZip NSU="..." schema="...">base64</docZip>` do loteDistDFeInt.
 * Cada conteúdo é base64(gzip(xml)) → gunzipSync. Erros de descompactação de um doc não derrubam o
 * lote inteiro (o doc problemático é ignorado).
 */
function extrairDocs(body: string): DistDoc[] {
  const docs: DistDoc[] = [];
  const re = /<docZip\b([^>]*)>([\s\S]*?)<\/docZip>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const attrs = m[1] ?? "";
    const b64 = (m[2] ?? "").replace(/\s+/g, "");
    const nsu = /\bNSU="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const schema = /\bschema="([^"]*)"/.exec(attrs)?.[1] ?? "";
    try {
      const xml = gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
      docs.push(classificarDoc(nsu, schema, xml));
    } catch {
      // doc corrompido / não-gzip: registra como "outro" com xml vazio para não perder o NSU.
      docs.push({ nsu, schema, tipo: "outro", xml: "" });
    }
  }
  return docs;
}

/** Envia o distDFeInt ao AN e parseia o retDistDFeInt (cStat/ultNSU/maxNSU + docs). */
async function enviarDistribuicao(
  distDFeInt: string,
  ambiente: AmbienteFiscal,
  cert: { pfx: Buffer; senha: string }
): Promise<DistResult> {
  const endpoint = AN_DISTRIBUICAO[ambiente];
  const res = await postSoap(endpoint, distEnvelope(distDFeInt), cert);

  // retDistDFeInt traz cStat/xMotivo/ultNSU/maxNSU; o loteDistDFeInt vem com os docZip.
  return {
    cStat: pickTag(res.body, "cStat") ?? "",
    xMotivo: pickTag(res.body, "xMotivo") ?? "",
    ultNSU: pickTag(res.body, "ultNSU") ?? "",
    maxNSU: pickTag(res.body, "maxNSU") ?? "",
    docs: extrairDocs(res.body),
    raw: res.body,
    statusCode: res.statusCode
  };
}

/**
 * Consulta a Distribuição de DF-e por NSU (paginação). Informe o ÚLTIMO NSU baixado em `ultNSU`
 * (use "0" na primeira vez); a SEFAZ devolve o lote a partir do próximo NSU + o novo ultNSU/maxNSU.
 *
 * cStat de retorno: 138 = documentos localizados; 137 = nenhum documento novo; 656 = consumo
 * indevido (cliente chamou cedo demais — aguardar ~1h antes de repetir).
 */
export async function consultarDistribuicaoDFe(params: {
  cnpj: string;
  cUFAutor: string;
  ambiente: AmbienteFiscal;
  ultNSU: string;
  cert: { pfx: Buffer; senha: string };
}): Promise<DistResult> {
  // ultNSU sempre com 15 dígitos zero-padded.
  const ultNSU = onlyDigits(params.ultNSU).padStart(15, "0").slice(-15);
  const consulta = `<distNSU><ultNSU>${ultNSU}</ultNSU></distNSU>`;
  const distDFeInt = buildDistDFeInt({
    ambiente: params.ambiente,
    cUFAutor: params.cUFAutor,
    cnpj: params.cnpj,
    consulta
  });
  return enviarDistribuicao(distDFeInt, params.ambiente, params.cert);
}

/**
 * Consulta a Distribuição de DF-e por chave de acesso (consChNFe). Retorna a NF-e completa (procNFe)
 * quando o CNPJ informado for destinatário/parte interessada da nota.
 */
export async function consultarDistribuicaoPorChave(params: {
  cnpj: string;
  cUFAutor: string;
  chNFe: string;
  ambiente: AmbienteFiscal;
  cert: { pfx: Buffer; senha: string };
}): Promise<DistResult> {
  const consulta = `<consChNFe><chNFe>${onlyDigits(params.chNFe)}</chNFe></consChNFe>`;
  const distDFeInt = buildDistDFeInt({
    ambiente: params.ambiente,
    cUFAutor: params.cUFAutor,
    cnpj: params.cnpj,
    consulta
  });
  return enviarDistribuicao(distDFeInt, params.ambiente, params.cert);
}
