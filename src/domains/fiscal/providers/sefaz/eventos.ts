/**
 * Eventos e consultas da NF-e (modelo 55) DIRETO nos web services da SEFAZ (F3): cancelamento
 * (evento 110111), carta de correção / CC-e (evento 110110), inutilização de numeração e consulta
 * do protocolo (situação) da NF-e. Reaproveita o certificado A1 + assinatura XMLDSig (signXml) e o
 * transporte SOAP 1.2 com TLS-mútuo (soapEnvelope/postSoap), espelhando os padrões do nfe-xml.ts.
 */
import type { AmbienteFiscal } from "@prisma/client";
import { AN_RECEPCAO_EVENTO, cUFFromUF, resolveSefazEndpoints } from "./endpoints";
import { NFE_NS, SOAP_ACTION, WSDL_NS, pickBlock, pickTag, postSoap, soapEnvelope } from "./soap";
import { signXml } from "./sign";

const onlyDigits = (s: string | number | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** Escapa os 5 caracteres especiais de XML. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Texto livre da SEFAZ: remove controle/quebra e normaliza espaços (a SEFAZ rejeita caracteres < 0x20). */
const sanitize = (v: string | null | undefined) =>
  (v ?? "").replace(/[\r\n\t\f\v]+/g, " ").replace(/[^\x20-\xFF]/g, "").replace(/ {2,}/g, " ").trim();

/**
 * dhEvento no fuso de São Paulo (-03:00), formato exigido pela SEFAZ (sem sufixo Z). Mesma mecânica
 * do dhEmiBrasilia do nfe-xml.ts.
 */
function dhEventoBrasilia(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}-03:00`;
}

const tpAmbDe = (ambiente: AmbienteFiscal) => (ambiente === "PRODUCAO" ? "1" : "2");

/** Texto oficial fixo da cláusula de condições de uso da Carta de Correção (CC-e). */
const COND_USO_CCE =
  "A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 " +
  "e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro " +
  "nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, " +
  "aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados " +
  "cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.";

export type EventoBuild = { xml: string; idEvento: string };
export type EventoResult = {
  status: "AUTORIZADO" | "REJEITADO" | "ERRO";
  protocolo?: string;
  motivo?: string;
  cStat?: string;
};

/** Id do evento: "ID" + tpEvento(6) + chNFe(44) + nSeqEvento(2 dígitos, zero-padded). */
function idEvento(tpEvento: string, chNFe: string, nSeqEvento: number): string {
  return `ID${tpEvento}${chNFe}${String(nSeqEvento).padStart(2, "0")}`;
}

/**
 * Evento de Cancelamento da NF-e (tpEvento=110111). `nProt` é o protocolo de AUTORIZAÇÃO da nota.
 * Retorna o `infEvento` (NÃO assinado) + o Id. A assinatura/envio ficam no enviarEvento.
 */
export function buildEventoCancelamento(params: {
  ambiente: AmbienteFiscal;
  cUF: string;
  cnpj: string;
  chNFe: string;
  nProt: string;
  xJust: string;
  nSeqEvento?: number;
}): EventoBuild {
  const tpEvento = "110111";
  const nSeq = params.nSeqEvento ?? 1;
  const Id = idEvento(tpEvento, params.chNFe, nSeq);
  const infEvento =
    `<infEvento Id="${Id}">` +
    `<cOrgao>${params.cUF}</cOrgao>` +
    `<tpAmb>${tpAmbDe(params.ambiente)}</tpAmb>` +
    `<CNPJ>${onlyDigits(params.cnpj)}</CNPJ>` +
    `<chNFe>${onlyDigits(params.chNFe)}</chNFe>` +
    `<dhEvento>${dhEventoBrasilia()}</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento>` +
    `<nSeqEvento>${nSeq}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00">` +
    `<descEvento>Cancelamento</descEvento>` +
    `<nProt>${onlyDigits(params.nProt)}</nProt>` +
    `<xJust>${esc(sanitize(params.xJust))}</xJust>` +
    `</detEvento>` +
    `</infEvento>`;
  return { xml: infEvento, idEvento: Id };
}

/**
 * Evento de Carta de Correção / CC-e (tpEvento=110110). `nSeqEvento` é a sequência informada (uma
 * NF-e pode ter várias CC-e). Retorna o `infEvento` (NÃO assinado) + o Id.
 */
export function buildEventoCCe(params: {
  ambiente: AmbienteFiscal;
  cUF: string;
  cnpj: string;
  chNFe: string;
  xCorrecao: string;
  nSeqEvento: number;
}): EventoBuild {
  const tpEvento = "110110";
  const nSeq = params.nSeqEvento;
  const Id = idEvento(tpEvento, params.chNFe, nSeq);
  const infEvento =
    `<infEvento Id="${Id}">` +
    `<cOrgao>${params.cUF}</cOrgao>` +
    `<tpAmb>${tpAmbDe(params.ambiente)}</tpAmb>` +
    `<CNPJ>${onlyDigits(params.cnpj)}</CNPJ>` +
    `<chNFe>${onlyDigits(params.chNFe)}</chNFe>` +
    `<dhEvento>${dhEventoBrasilia()}</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento>` +
    `<nSeqEvento>${nSeq}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00">` +
    `<descEvento>Carta de Correcao</descEvento>` +
    `<xCorrecao>${esc(sanitize(params.xCorrecao))}</xCorrecao>` +
    `<xCondUso>${esc(COND_USO_CCE)}</xCondUso>` +
    `</detEvento>` +
    `</infEvento>`;
  return { xml: infEvento, idEvento: Id };
}

/**
 * Assina o `infEvento`, monta o `envEvento` (idLote=1, um único `<evento>`), envia ao
 * RecepcaoEvento4 e parseia o retorno (retEvento/infEvento). cStat 135/136 = registrado e vinculado;
 * 155 = registrado fora de prazo (ainda válido). Demais = rejeição.
 */
export async function enviarEvento(
  infEventoXml: string,
  uf: string,
  ambiente: AmbienteFiscal,
  cert: { pfx: Buffer; senha: string },
  pem: { privateKeyPem: string; certPem: string }
): Promise<EventoResult> {
  const endpoints = resolveSefazEndpoints(uf, ambiente);
  // <evento> assina o infEvento (Reference ao Id do infEvento, Signature logo após).
  const eventoBase = `<evento versao="1.00" xmlns="${NFE_NS}">${infEventoXml}</evento>`;
  const eventoAssinado = signXml(eventoBase, "infEvento", pem.privateKeyPem, pem.certPem);
  // idLote: alguns serviços da SEFAZ rejeitam (object reference) o lote com id curto — usa os 15
  // últimos dígitos da chave do evento (mesmo padrão do enviNFe na emissão).
  const idLote = (/Id="ID\d{6}(\d{44})/.exec(infEventoXml)?.[1] ?? "1").slice(-15);
  const envEvento =
    `<envEvento versao="1.00" xmlns="${NFE_NS}">` +
    `<idLote>${idLote}</idLote>` +
    eventoAssinado +
    `</envEvento>`;
  const res = await postSoap(endpoints.recepcaoEvento, soapEnvelope(WSDL_NS.evento, envEvento), cert, SOAP_ACTION.evento);

  // O retorno traz um cStat de lote e, dentro de retEvento, o cStat do evento em si.
  const retEvento = pickBlock(res.body, "retEvento");
  const escopo = retEvento ?? res.body;
  const cStat = pickTag(escopo, "cStat") ?? "";
  const xMotivo = pickTag(escopo, "xMotivo") ?? "";
  const nProt = pickTag(escopo, "nProt");
  const motivo = `${cStat ? `${cStat} ` : ""}${xMotivo}`.trim() || `HTTP ${res.statusCode}`;

  if (cStat === "135" || cStat === "136" || cStat === "155") {
    return { status: "AUTORIZADO", protocolo: nProt, motivo, cStat };
  }
  if (cStat) {
    return { status: "REJEITADO", protocolo: nProt, motivo, cStat };
  }
  return { status: "ERRO", motivo, cStat };
}

export type InutilizacaoResult = {
  status: "AUTORIZADO" | "REJEITADO" | "ERRO";
  protocolo?: string;
  motivo?: string;
  cStat?: string;
};

/**
 * Inutilização de faixa de numeração (NFeInutilizacao4). infInut Id = "ID" + cUF(2) + ano(2) +
 * CNPJ(14) + mod(2) + serie(3) + nNFIni(9) + nNFFin(9). cStat 102 = inutilização homologada.
 * Assina o infInut (signXml com "infInut") e envia ao endpoint de inutilização.
 */
export async function inutilizarNumeracao(
  params: {
    ambiente: AmbienteFiscal;
    uf: string;
    cnpj: string;
    ano: number;
    serie: number;
    nNFIni: number;
    nNFFin: number;
    xJust: string;
    modelo?: string;
  },
  cert: { pfx: Buffer; senha: string },
  pem: { privateKeyPem: string; certPem: string }
): Promise<InutilizacaoResult> {
  const cUF = cUFFromUF(params.uf);
  const ano = String(params.ano % 100).padStart(2, "0");
  const cnpj = onlyDigits(params.cnpj).padStart(14, "0");
  const mod = (params.modelo ?? "55").padStart(2, "0");
  const serie = String(params.serie).padStart(3, "0");
  const nIni = String(params.nNFIni).padStart(9, "0");
  const nFin = String(params.nNFFin).padStart(9, "0");
  const Id = `ID${cUF}${ano}${cnpj}${mod}${serie}${nIni}${nFin}`;

  const infInut =
    `<infInut Id="${Id}">` +
    `<tpAmb>${tpAmbDe(params.ambiente)}</tpAmb>` +
    `<xServ>INUTILIZAR</xServ>` +
    `<cUF>${cUF}</cUF>` +
    `<ano>${ano}</ano>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    `<mod>${mod}</mod>` +
    `<serie>${params.serie}</serie>` +
    `<nNFIni>${params.nNFIni}</nNFIni>` +
    `<nNFFin>${params.nNFFin}</nNFFin>` +
    `<xJust>${esc(sanitize(params.xJust))}</xJust>` +
    `</infInut>`;
  const inutNFe = `<inutNFe versao="4.00" xmlns="${NFE_NS}">${infInut}</inutNFe>`;
  const assinado = signXml(inutNFe, "infInut", pem.privateKeyPem, pem.certPem);

  const endpoints = resolveSefazEndpoints(params.uf, params.ambiente);
  const res = await postSoap(endpoints.inutilizacao, soapEnvelope(WSDL_NS.inutilizacao, assinado), cert, SOAP_ACTION.inutilizacao);

  const ret = pickBlock(res.body, "infInut") ?? res.body;
  const cStat = pickTag(ret, "cStat") ?? "";
  const xMotivo = pickTag(ret, "xMotivo") ?? "";
  const nProt = pickTag(ret, "nProt");
  const motivo = `${cStat ? `${cStat} ` : ""}${xMotivo}`.trim() || `HTTP ${res.statusCode}`;

  if (cStat === "102") return { status: "AUTORIZADO", protocolo: nProt, motivo, cStat };
  if (cStat) return { status: "REJEITADO", protocolo: nProt, motivo, cStat };
  return { status: "ERRO", motivo, cStat };
}

export type ConsultaProtocoloResult = {
  cStat: string;
  xMotivo: string;
  /** protNFe completo (protocolo de autorização da nota), quando existir. */
  protNFe?: string;
  /** nProt extraído do protNFe (protocolo de autorização). */
  nProt?: string;
  raw: string;
  statusCode: number;
};

/**
 * Consulta a situação/protocolo de uma NF-e (NFeConsultaProtocolo4). consSitNFe versao="4.00" com
 * tpAmb, xServ=CONSULTAR, chNFe. Retorna o cStat da consulta e o protNFe (via pickBlock) quando a
 * nota está autorizada. cStat 100 = autorizada; 101 = cancelada; 110 = denegada.
 */
export async function consultarProtocolo(
  chNFe: string,
  uf: string,
  ambiente: AmbienteFiscal,
  cert: { pfx: Buffer; senha: string }
): Promise<ConsultaProtocoloResult> {
  const endpoints = resolveSefazEndpoints(uf, ambiente);
  const consSitNFe =
    `<consSitNFe versao="4.00" xmlns="${NFE_NS}">` +
    `<tpAmb>${tpAmbDe(ambiente)}</tpAmb>` +
    `<xServ>CONSULTAR</xServ>` +
    `<chNFe>${onlyDigits(chNFe)}</chNFe>` +
    `</consSitNFe>`;
  const res = await postSoap(endpoints.consultaProtocolo, soapEnvelope(WSDL_NS.consulta, consSitNFe), cert, SOAP_ACTION.consulta);
  const protNFe = pickBlock(res.body, "protNFe");
  return {
    cStat: pickTag(res.body, "cStat") ?? "",
    xMotivo: pickTag(res.body, "xMotivo") ?? "",
    protNFe,
    nProt: protNFe ? pickTag(protNFe, "nProt") : undefined,
    raw: res.body,
    statusCode: res.statusCode
  };
}

/**
 * Tipos de evento da Manifestação do Destinatário:
 *  - 210200 Confirmação da Operação
 *  - 210210 Ciência da Operação
 *  - 210220 Desconhecimento da Operação
 *  - 210240 Operação não Realizada (exige justificativa com ≥15 caracteres)
 */
export type ManifestacaoTipo = "210200" | "210210" | "210220" | "210240";

/** descEvento oficial por tipo de manifestação. */
const DESC_MANIFESTACAO: Record<ManifestacaoTipo, string> = {
  "210200": "Confirmacao da Operacao",
  "210210": "Ciencia da Operacao",
  "210220": "Desconhecimento da Operacao",
  "210240": "Operacao nao Realizada"
};

/**
 * Manifestação do Destinatário (eventos 210200/210210/210220/210240) DIRETO no Ambiente Nacional.
 *
 * cOrgao=91 (AN). O infEvento é assinado (signXml "infEvento"), envolto em <evento versao="1.00"> e
 * enviado ao AN_RECEPCAO_EVENTO[ambiente] — NÃO ao RecepcaoEvento da UF. cStat 135/136 = evento
 * registrado/vinculado à NF-e. O tipo 210240 (Operação não Realizada) exige <xJust> com ≥15 chars.
 */
export async function enviarManifestacao(params: {
  ambiente: AmbienteFiscal;
  cnpj: string;
  chNFe: string;
  tipoEvento: ManifestacaoTipo;
  justificativa?: string;
  nSeqEvento?: number;
  cert: { pfx: Buffer; senha: string };
  pem: { privateKeyPem: string; certPem: string };
}): Promise<EventoResult> {
  const tpEvento = params.tipoEvento;
  const nSeq = params.nSeqEvento ?? 1;
  const chNFe = onlyDigits(params.chNFe);
  const Id = idEvento(tpEvento, chNFe, nSeq);

  // Só a "Operação não Realizada" leva (e exige) justificativa (≥15 caracteres).
  const exigeJust = tpEvento === "210240";
  const xJust = sanitize(params.justificativa);
  if (exigeJust && xJust.length < 15) {
    throw new Error("A Operação não Realizada (210240) exige justificativa com pelo menos 15 caracteres.");
  }

  const detEvento =
    `<detEvento versao="1.00">` +
    `<descEvento>${DESC_MANIFESTACAO[tpEvento]}</descEvento>` +
    (exigeJust ? `<xJust>${esc(xJust)}</xJust>` : "") +
    `</detEvento>`;

  const infEvento =
    `<infEvento Id="${Id}">` +
    `<cOrgao>91</cOrgao>` +
    `<tpAmb>${tpAmbDe(params.ambiente)}</tpAmb>` +
    `<CNPJ>${onlyDigits(params.cnpj)}</CNPJ>` +
    `<chNFe>${chNFe}</chNFe>` +
    `<dhEvento>${dhEventoBrasilia()}</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento>` +
    `<nSeqEvento>${nSeq}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    detEvento +
    `</infEvento>`;

  const eventoBase = `<evento versao="1.00" xmlns="${NFE_NS}">${infEvento}</evento>`;
  const eventoAssinado = signXml(eventoBase, "infEvento", params.pem.privateKeyPem, params.pem.certPem);
  const envEvento =
    `<envEvento versao="1.00" xmlns="${NFE_NS}">` +
    `<idLote>1</idLote>` +
    eventoAssinado +
    `</envEvento>`;

  const res = await postSoap(
    AN_RECEPCAO_EVENTO[params.ambiente],
    soapEnvelope(WSDL_NS.evento, envEvento),
    params.cert,
    SOAP_ACTION.evento
  );

  const retEvento = pickBlock(res.body, "retEvento");
  const escopo = retEvento ?? res.body;
  const cStat = pickTag(escopo, "cStat") ?? "";
  const xMotivo = pickTag(escopo, "xMotivo") ?? "";
  const nProt = pickTag(escopo, "nProt");
  const motivo = `${cStat ? `${cStat} ` : ""}${xMotivo}`.trim() || `HTTP ${res.statusCode}`;

  if (cStat === "135" || cStat === "136") {
    return { status: "AUTORIZADO", protocolo: nProt, motivo, cStat };
  }
  if (cStat) {
    return { status: "REJEITADO", protocolo: nProt, motivo, cStat };
  }
  return { status: "ERRO", motivo, cStat };
}
