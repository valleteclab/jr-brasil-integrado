import { gzipSync } from "node:zlib";
import { montarChave, aammFromDhEmi, deterministicCNF } from "../chave";
import { CODIGO_UF } from "../endpoints";
import type { AmbienteFiscal } from "@prisma/client";

/**
 * MDF-e (Manifesto Eletrônico de Documentos Fiscais, modelo 58, leiaute 3.00).
 * Autorizador NACIONAL único: SVRS (todas as UFs). Caso de uso: transporte de CARGA
 * PRÓPRIA (tpEmit=2) intermunicipal/interestadual — cliente com veículo próprio.
 * Ciclo: emitir (RecepcaoSinc, XML gzip+base64) → encerrar (evento 110112) ao chegar;
 * cancelamento (110111) em até 24h. URLs conferidas em dfe-portal.svrs.rs.gov.br/Mdfe/Servicos.
 */

export const MDFE_NS = "http://www.portalfiscal.inf.br/mdfe";

export const MDFE_ENDPOINTS: Record<AmbienteFiscal, { recepcaoSinc: string; consulta: string; status: string; evento: string }> = {
  PRODUCAO: {
    recepcaoSinc: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
    consulta: "https://mdfe.svrs.rs.gov.br/ws/MDFeConsulta/MDFeConsulta.asmx",
    status: "https://mdfe.svrs.rs.gov.br/ws/MDFeStatusServico/MDFeStatusServico.asmx",
    evento: "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx"
  },
  HOMOLOGACAO: {
    recepcaoSinc: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
    consulta: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeConsulta/MDFeConsulta.asmx",
    status: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeStatusServico/MDFeStatusServico.asmx",
    evento: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx"
  }
};

export const MDFE_WSDL = {
  recepcaoSinc: "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoSinc",
  consulta: "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeConsulta",
  status: "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeStatusServico",
  evento: "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento"
} as const;

export const MDFE_SOAP_ACTION = {
  recepcaoSinc: `${MDFE_WSDL.recepcaoSinc}/mdfeRecepcao`,
  consulta: `${MDFE_WSDL.consulta}/mdfeConsultaMDF`,
  status: `${MDFE_WSDL.status}/mdfeStatusServicoMDF`,
  evento: `${MDFE_WSDL.evento}/mdfeRecepcaoEvento`
} as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const fmt2 = (v: number) => (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2);

/** Data/hora Brasília ISO com offset -03:00 (sem ms). */
export function dhBrasilia(date = new Date()): string {
  const sp = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sp.getFullYear()}-${p(sp.getMonth() + 1)}-${p(sp.getDate())}T${p(sp.getHours())}:${p(sp.getMinutes())}:${p(sp.getSeconds())}-03:00`;
}

export type MdfeInput = {
  ambiente: AmbienteFiscal;
  serie: number;
  numero: number;
  emitente: {
    cnpj: string;
    inscricaoEstadual: string;
    razaoSocial: string;
    nomeFantasia?: string | null;
    uf: string;
    codigoMunicipioIbge: string;
    municipio: string;
    logradouro?: string | null;
    numeroEndereco?: string | null;
    bairro?: string | null;
    cep?: string | null;
    fone?: string | null;
  };
  ufInicio: string;
  ufFim: string;
  municipioCarregamento: { codigoIbge: string; nome: string };
  /** UFs intermediárias do trajeto (sem início/fim), na ordem. */
  percurso?: string[];
  veiculo: {
    placa: string;          // ex.: ABC1D23
    tara: number;           // KG (inteiro)
    tipoRodado: string;     // 01 truck | 02 toco | 03 cavalo | 04 van | 05 utilitário | 06 outros
    tipoCarroceria: string; // 00 n/a | 01 aberta | 02 fechada/baú | 03 granelera | 04 porta-container | 05 sider
    ufLicenciamento?: string | null;
  };
  condutores: Array<{ nome: string; cpf: string }>;
  /** Notas transportadas, agrupadas por município de descarga. */
  descargas: Array<{ codigoIbge: string; nome: string; chavesNfe: string[] }>;
  valorCarga: number;   // R$ (soma das notas)
  pesoBrutoKg: number;  // qCarga com cUnid=01 (KG)
  infoAdicional?: string | null;
};

export type BuildMdfeResult = { xml: string; chave: string; cMDF: string };

/** Monta o infMDFe (3.00) pronto para assinar (signXml em infMDFe). */
export function buildMdfeXml(input: MdfeInput): BuildMdfeResult {
  const e = input.emitente;
  const cUF = CODIGO_UF[e.uf.toUpperCase()];
  if (!cUF) throw new Error(`UF do emitente inválida: ${e.uf}`);
  const dhEmi = dhBrasilia();
  const cnpj = dig(e.cnpj);
  const cMDF = deterministicCNF(cnpj, "58", String(input.serie), String(input.numero));
  const { chave, cDV } = montarChave({
    cUF,
    aamm: aammFromDhEmi(dhEmi),
    cnpj,
    mod: "58",
    serie: String(input.serie),
    nNF: String(input.numero),
    tpEmis: "1",
    cNF: cMDF
  });

  const tpAmb = input.ambiente === "PRODUCAO" ? "1" : "2";
  const percurso = (input.percurso ?? [])
    .map((uf) => `<infPercurso><UFPer>${esc(uf.toUpperCase())}</UFPer></infPercurso>`)
    .join("");

  const ide =
    `<ide>` +
      `<cUF>${cUF}</cUF><tpAmb>${tpAmb}</tpAmb><tpEmit>2</tpEmit>` +
      `<mod>58</mod><serie>${input.serie}</serie><nMDF>${input.numero}</nMDF>` +
      `<cMDF>${cMDF}</cMDF><cDV>${cDV}</cDV><modal>1</modal>` +
      `<dhEmi>${dhEmi}</dhEmi><tpEmis>1</tpEmis><procEmi>0</procEmi><verProc>XERP 1.0</verProc>` +
      `<UFIni>${esc(input.ufInicio.toUpperCase())}</UFIni><UFFim>${esc(input.ufFim.toUpperCase())}</UFFim>` +
      `<infMunCarrega><cMunCarrega>${dig(input.municipioCarregamento.codigoIbge)}</cMunCarrega>` +
      `<xMunCarrega>${esc(input.municipioCarregamento.nome)}</xMunCarrega></infMunCarrega>` +
      percurso +
    `</ide>`;

  const ender =
    `<enderEmit>` +
      `<xLgr>${esc(e.logradouro || "NAO INFORMADO")}</xLgr><nro>${esc(e.numeroEndereco || "S/N")}</nro>` +
      `<xBairro>${esc(e.bairro || "CENTRO")}</xBairro>` +
      `<cMun>${dig(e.codigoMunicipioIbge)}</cMun><xMun>${esc(e.municipio)}</xMun>` +
      (e.cep ? `<CEP>${dig(e.cep)}</CEP>` : "") +
      `<UF>${esc(e.uf.toUpperCase())}</UF>` +
      (e.fone ? `<fone>${dig(e.fone)}</fone>` : "") +
    `</enderEmit>`;

  const emit =
    `<emit><CNPJ>${cnpj}</CNPJ><IE>${dig(e.inscricaoEstadual)}</IE>` +
    `<xNome>${esc(e.razaoSocial.slice(0, 60))}</xNome>` +
    (e.nomeFantasia ? `<xFant>${esc(e.nomeFantasia.slice(0, 60))}</xFant>` : "") +
    ender + `</emit>`;

  const condutores = input.condutores
    .map((c) => `<condutor><xNome>${esc(c.nome.slice(0, 60))}</xNome><CPF>${dig(c.cpf)}</CPF></condutor>`)
    .join("");

  const infModal =
    `<infModal versaoModal="3.00"><rodo>` +
      `<veicTracao>` +
        `<placa>${esc(input.veiculo.placa.toUpperCase().replace(/[^A-Z0-9]/g, ""))}</placa>` +
        `<tara>${Math.round(input.veiculo.tara)}</tara>` +
        condutores +
        `<tpRod>${input.veiculo.tipoRodado}</tpRod>` +
        `<tpCar>${input.veiculo.tipoCarroceria}</tpCar>` +
        (input.veiculo.ufLicenciamento ? `<UF>${esc(input.veiculo.ufLicenciamento.toUpperCase())}</UF>` : "") +
      `</veicTracao>` +
    `</rodo></infModal>`;

  const infDoc =
    `<infDoc>` +
    input.descargas
      .map(
        (d) =>
          `<infMunDescarga><cMunDescarga>${dig(d.codigoIbge)}</cMunDescarga>` +
          `<xMunDescarga>${esc(d.nome)}</xMunDescarga>` +
          d.chavesNfe.map((ch) => `<infNFe><chNFe>${dig(ch)}</chNFe></infNFe>`).join("") +
          `</infMunDescarga>`
      )
      .join("") +
    `</infDoc>`;

  const qNfe = input.descargas.reduce((s, d) => s + d.chavesNfe.length, 0);
  const tot =
    `<tot><qNFe>${qNfe}</qNFe><vCarga>${fmt2(input.valorCarga)}</vCarga>` +
    `<cUnid>01</cUnid><qCarga>${input.pesoBrutoKg.toFixed(4)}</qCarga></tot>`;

  const infAdic = input.infoAdicional ? `<infAdic><infCpl>${esc(input.infoAdicional.slice(0, 2000))}</infCpl></infAdic>` : "";

  const xml =
    `<MDFe xmlns="${MDFE_NS}">` +
      `<infMDFe Id="MDFe${chave}" versao="3.00">` +
        ide + emit + infModal + infDoc + tot + infAdic +
      `</infMDFe>` +
    `</MDFe>`;

  return { xml, chave, cMDF };
}

/** infMDFeSupl (QR Code — URL nacional do portal SVRS, sem CSC). Inserir APÓS assinar,
 * entre </infMDFe> e <Signature> (ordem do XSD: infMDFe, infMDFeSupl, Signature). */
export function insertMdfeSupl(signedXml: string, chave: string, ambiente: AmbienteFiscal): string {
  const tpAmb = ambiente === "PRODUCAO" ? "1" : "2";
  const url = `https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=${chave.replace(/\D/g, "")}&tpAmb=${tpAmb}`;
  const supl = `<infMDFeSupl><qrCodMDFe><![CDATA[${url}]]></qrCodMDFe></infMDFeSupl>`;
  return signedXml.replace("<Signature", `${supl}<Signature`);
}

/** Mensagem do RecepcaoSinc: o MDFe ASSINADO vai gzip+base64 dentro de <mdfeDadosMsg>. */
export function mdfeRecepcaoPayload(signedXml: string): string {
  const semProlog = signedXml.replace(/^<\?xml[^>]*\?>/, "");
  return gzipSync(Buffer.from(semProlog, "utf8")).toString("base64");
}

/** consStatServMDFe (status do serviço). */
export function buildConsStatus(ambiente: AmbienteFiscal): string {
  return `<consStatServMDFe xmlns="${MDFE_NS}" versao="3.00"><tpAmb>${ambiente === "PRODUCAO" ? "1" : "2"}</tpAmb><xServ>STATUS</xServ></consStatServMDFe>`;
}

/** consSitMDFe (consulta por chave). */
export function buildConsSit(ambiente: AmbienteFiscal, chave: string): string {
  return `<consSitMDFe xmlns="${MDFE_NS}" versao="3.00"><tpAmb>${ambiente === "PRODUCAO" ? "1" : "2"}</tpAmb><xServ>CONSULTAR</xServ><chMDFe>${dig(chave)}</chMDFe></consSitMDFe>`;
}

export type MdfeEvento =
  | { tipo: "ENCERRAMENTO"; nProt: string; dtEnc: string; cMun: string; cUf: string }
  | { tipo: "CANCELAMENTO"; nProt: string; justificativa: string };

/** eventoMDFe (3.00) pronto para assinar (signXml em infEvento). */
export function buildEventoMdfe(params: {
  ambiente: AmbienteFiscal;
  chave: string;
  cnpj: string;
  nSeqEvento?: number;
  evento: MdfeEvento;
}): { xml: string; idEvento: string } {
  const chave = dig(params.chave);
  const tpEvento = params.evento.tipo === "ENCERRAMENTO" ? "110112" : "110111";
  const nSeq = params.nSeqEvento ?? 1;
  const idEvento = `ID${tpEvento}${chave}${String(nSeq).padStart(2, "0")}`;
  const cOrgao = chave.slice(0, 2);
  const tpAmb = params.ambiente === "PRODUCAO" ? "1" : "2";

  const det =
    params.evento.tipo === "ENCERRAMENTO"
      ? `<evEncMDFe><descEvento>Encerramento</descEvento><nProt>${dig(params.evento.nProt)}</nProt>` +
        `<dtEnc>${params.evento.dtEnc}</dtEnc><cUF>${dig(params.evento.cUf)}</cUF><cMun>${dig(params.evento.cMun)}</cMun></evEncMDFe>`
      : `<evCancMDFe><descEvento>Cancelamento</descEvento><nProt>${dig(params.evento.nProt)}</nProt>` +
        `<xJust>${esc(params.evento.justificativa.slice(0, 255))}</xJust></evCancMDFe>`;

  const xml =
    `<eventoMDFe xmlns="${MDFE_NS}" versao="3.00">` +
      `<infEvento Id="${idEvento}">` +
        `<cOrgao>${cOrgao}</cOrgao><tpAmb>${tpAmb}</tpAmb>` +
        `<CNPJ>${dig(params.cnpj)}</CNPJ><chMDFe>${chave}</chMDFe>` +
        `<dhEvento>${dhBrasilia()}</dhEvento><tpEvento>${tpEvento}</tpEvento>` +
        `<nSeqEvento>${nSeq}</nSeqEvento>` +
        `<detEvento versaoEvento="3.00">${det}</detEvento>` +
      `</infEvento>` +
    `</eventoMDFe>`;

  return { xml, idEvento };
}
