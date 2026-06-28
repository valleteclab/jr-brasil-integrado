/**
 * Provedor SEFAZ — emissão de NF-e (modelo 55) DIRETO nos web services da SEFAZ, sem intermediário
 * e sem API paga. Autorizadora inicial: SVRS (cobre 16 UFs). Reaproveita a infraestrutura do
 * provedor NACIONAL (certificado A1 criptografado, assinatura XMLDSig, TLS-mútuo), trocando
 * REST/JSON por SOAP/XML do leiaute 4.00.
 *
 * F0: transporte SOAP + TLS-mútuo via NFeStatusServico4 (testConnection).
 * F1 (esta entrega): emissão síncrona — buildNfeXml (4.00) + assinatura XMLDSig + NFeAutorizacao4
 * (indSinc=1) + parse do protNFe + montagem do nfeProc. Cancelamento/CC-e/consulta entram na F3
 * (ver docs/provider-sefaz-nfe-design.md).
 */
import type { AmbienteFiscal, ProvedorFiscal, StatusNotaFiscal } from "@prisma/client";
import type {
  CancelInput, CancelResult, CorrectionInput, CorrectionResult,
  EmitInput, EmitResult, FiscalProvider, ProviderContext, TestConnectionResult
} from "./types";
import { cUFFromUF, resolveNfceEndpoints, resolveSefazEndpoints } from "./sefaz/endpoints";
import { buildNfceQrCode } from "./sefaz/qrcode-nfce";
import { NFE_NS, SOAP_ACTION, WSDL_NS, pickBlock, pickTag, postSoap, soapEnvelope } from "./sefaz/soap";
import { buildNfeXml } from "./sefaz/nfe-xml";
import { pfxToPem, signNfe } from "./sefaz/sign";
import {
  buildEventoCCe, buildEventoCancelamento, consultarProtocolo, enviarEvento,
  inutilizarNumeracao, type InutilizacaoResult
} from "./sefaz/eventos";

const onlyDigitsStr = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
/** cUF embutido na chave de acesso (2 primeiros dígitos). */
const cUFFromChave = (chave: string) => onlyDigitsStr(chave).slice(0, 2);
/** CNPJ do emitente embutido na chave de acesso (dígitos 7–20, 14 chars). */
const cnpjFromChave = (chave: string) => onlyDigitsStr(chave).slice(6, 20);

/** cStat de autorização → status interno. 100/150 = autorizada; 110/301/302/303 = denegada. */
function statusFromCStat(cStat: string): StatusNotaFiscal {
  if (cStat === "100" || cStat === "150") return "AUTORIZADA";
  if (["110", "301", "302", "303"].includes(cStat)) return "DENEGADA";
  return "REJEITADA";
}

/**
 * Consulta o status do serviço da autorizadora (NFeStatusServico4). É a chamada mais leve da
 * SEFAZ — não emite nada — e exercita todo o caminho: envelope SOAP 1.2 + TLS-mútuo com o A1.
 * cStat 107 = serviço em operação.
 */
export async function consultarStatusServico(
  uf: string,
  ambiente: AmbienteFiscal,
  cert: { pfx: Buffer; senha: string }
): Promise<{ cStat: string; xMotivo: string; tMed?: string; raw: string; statusCode: number }> {
  const endpoints = resolveSefazEndpoints(uf, ambiente);
  const cUF = cUFFromUF(uf);
  const tpAmb = ambiente === "PRODUCAO" ? "1" : "2";
  const consStatServ =
    `<consStatServ versao="4.00" xmlns="${NFE_NS}">` +
    `<tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ>` +
    `</consStatServ>`;
  const envelope = soapEnvelope(WSDL_NS.status, consStatServ);
  const res = await postSoap(endpoints.statusServico, envelope, cert, SOAP_ACTION.status);
  return {
    cStat: pickTag(res.body, "cStat") ?? "",
    xMotivo: pickTag(res.body, "xMotivo") ?? "",
    tMed: pickTag(res.body, "tMed"),
    raw: res.body,
    statusCode: res.statusCode
  };
}

export class SefazFiscalProvider implements FiscalProvider {
  readonly id: ProvedorFiscal = "SEFAZ" as ProvedorFiscal;

  async emit(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    if (input.document.modelo === "NFSE") {
      return { status: "ERRO", motivo: "O provedor SEFAZ emite apenas NF-e/NFC-e (NFS-e segue pelo NACIONAL/ACBr)." };
    }
    const isNfce = input.document.modelo === "NFCE";
    if (!ctx.certificado?.pfx) {
      return { status: "ERRO", motivo: `Certificado A1 não disponível para assinar/transmitir a ${isNfce ? "NFC-e" : "NF-e"}.` };
    }
    const uf = (ctx.ufEmitente ?? input.emitter.uf ?? "").trim();
    if (!uf) {
      return { status: "ERRO", motivo: "UF do emitente não definida — necessária para resolver a autorizadora." };
    }
    // NFC-e exige CSC + idCSC (do cadastro) para o QR Code do infNFeSupl.
    if (isNfce && (!ctx.nfceCsc?.trim() || !ctx.nfceIdCsc?.trim())) {
      return { status: "ERRO", motivo: "NFC-e exige CSC e idCSC cadastrados (Configurações → Fiscal → NFC-e)." };
    }

    let chave: string;
    let signed: string;
    try {
      const built = buildNfeXml(input);
      chave = built.chave;
      const { privateKeyPem, certPem } = pfxToPem(ctx.certificado.pfx, ctx.certificado.senha);
      signed = signNfe(built.xml, privateKeyPem, certPem);
      if (isNfce) {
        // infNFeSupl (QR Code + urlChave) vai entre </infNFe> e <Signature> (ordem do XSD). NÃO é
        // assinado (a assinatura referencia o Id do infNFe), então inseri-lo após assinar é válido.
        const tpAmb = input.document.ambiente === "PRODUCAO" ? "1" : "2";
        const qr = buildNfceQrCode({ chave, tpAmb, idCsc: ctx.nfceIdCsc!, csc: ctx.nfceCsc!, uf, ambiente: ctx.ambiente });
        const supl = `<infNFeSupl><qrCode><![CDATA[${qr.qrCode}]]></qrCode><urlChave>${qr.urlChave}</urlChave></infNFeSupl>`;
        signed = signed.replace(/<Signature\b/, `${supl}<Signature`);
      }
    } catch (e) {
      return { status: "ERRO", motivo: `Falha ao montar/assinar a ${isNfce ? "NFC-e" : "NF-e"}: ${e instanceof Error ? e.message : String(e)}` };
    }

    // Lote síncrono (indSinc=1): a SEFAZ devolve o protNFe direto no retorno.
    const idLote = chave.slice(-15);
    const enviNFe =
      `<enviNFe versao="4.00" xmlns="${NFE_NS}">` +
      `<idLote>${idLote}</idLote><indSinc>1</indSinc>${signed}` +
      `</enviNFe>`;
    // NFC-e tem autorizadora própria (a BA delega à SVRS); NF-e 55 usa a tabela da UF.
    const endpoints = isNfce ? resolveNfceEndpoints(uf, ctx.ambiente) : resolveSefazEndpoints(uf, ctx.ambiente);
    const res = await postSoap(endpoints.autorizacao, soapEnvelope(WSDL_NS.autorizacao, enviNFe), ctx.certificado, SOAP_ACTION.autorizacao);

    const protNFe = pickBlock(res.body, "protNFe");
    const loteCStat = pickTag(res.body, "cStat");
    const nRec = pickTag(res.body, "nRec");

    if (!protNFe) {
      // Sem protNFe: lote recebido (assíncrono, cStat 103) ou erro/rejeição de lote.
      const motivo = `${loteCStat ? `cStat ${loteCStat}: ` : ""}${pickTag(res.body, "xMotivo") || `HTTP ${res.statusCode}`}`;
      if (loteCStat === "103" || nRec) {
        return { status: "PROCESSANDO", reciboLote: nRec ?? undefined, motivo: `Lote recebido — consultar recibo (F3). ${motivo}` };
      }
      return { status: "REJEITADA", motivo };
    }

    const cStat = pickTag(protNFe, "cStat") ?? "";
    const xMotivo = pickTag(protNFe, "xMotivo") ?? "";
    const nProt = pickTag(protNFe, "nProt");
    const chNFe = pickTag(protNFe, "chNFe") ?? chave;
    const status = statusFromCStat(cStat);

    if (status === "AUTORIZADA") {
      // nfeProc = NF-e assinada + protNFe (XML distribuível/arquivável).
      const nfeProc = `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="${NFE_NS}">${signed}${protNFe}</nfeProc>`;
      return { status, chaveAcesso: chNFe, protocolo: nProt, providerRef: chNFe, reciboLote: nRec ?? undefined, xml: nfeProc, motivo: `${cStat} ${xMotivo}`.trim() };
    }
    return { status, chaveAcesso: chNFe, motivo: `${cStat} ${xMotivo}`.trim() };
  }

  async cancel(input: CancelInput, ctx: ProviderContext): Promise<CancelResult> {
    if (!ctx.certificado?.pfx) {
      return { status: "ERRO", motivo: "Certificado A1 não disponível para assinar/transmitir o cancelamento." };
    }
    const chave = onlyDigitsStr(input.chaveAcesso);
    if (chave.length !== 44) {
      return { status: "ERRO", motivo: "Chave de acesso da NF-e ausente/inválida — necessária para o cancelamento." };
    }
    const uf = (ctx.ufEmitente ?? "").trim();
    if (!uf) {
      return { status: "ERRO", motivo: "UF do emitente não definida — necessária para resolver a autorizadora da NF-e." };
    }
    if ((input.justificativa ?? "").trim().length < 15) {
      return { status: "ERRO", motivo: "A justificativa de cancelamento deve ter ao menos 15 caracteres." };
    }

    try {
      // O cancelamento exige o protocolo de AUTORIZAÇÃO da nota (nProt). O CancelInput não tem campo
      // dedicado para isso e, no SEFAZ, o providerRef guarda a CHAVE (não o protocolo). Quando o
      // providerRef vier como um nProt (15 dígitos) usa-o; senão consulta a SEFAZ para obtê-lo.
      let nProt = onlyDigitsStr(input.providerRef);
      if (nProt.length !== 15) {
        const sit = await consultarProtocolo(chave, uf, ctx.ambiente, ctx.certificado);
        if (!sit.nProt) {
          return { status: "ERRO", motivo: `Protocolo de autorização não localizado para cancelar (consulta: ${sit.cStat} ${sit.xMotivo}).`.trim() };
        }
        nProt = sit.nProt;
      }

      const { privateKeyPem, certPem } = pfxToPem(ctx.certificado.pfx, ctx.certificado.senha);
      const evento = buildEventoCancelamento({
        ambiente: ctx.ambiente,
        cUF: cUFFromChave(chave),
        cnpj: cnpjFromChave(chave),
        chNFe: chave,
        nProt,
        xJust: input.justificativa,
        nSeqEvento: 1
      });
      const r = await enviarEvento(evento.xml, uf, ctx.ambiente, ctx.certificado, { privateKeyPem, certPem });
      return { status: r.status, protocolo: r.protocolo, motivo: r.motivo };
    } catch (e) {
      return { status: "ERRO", motivo: `Falha ao cancelar a NF-e: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async correct(input: CorrectionInput, ctx: ProviderContext): Promise<CorrectionResult> {
    if (!ctx.certificado?.pfx) {
      return { status: "ERRO", motivo: "Certificado A1 não disponível para assinar/transmitir a carta de correção." };
    }
    const chave = onlyDigitsStr(input.chaveAcesso);
    if (chave.length !== 44) {
      return { status: "ERRO", motivo: "Chave de acesso da NF-e ausente/inválida — necessária para a carta de correção." };
    }
    const uf = (ctx.ufEmitente ?? "").trim();
    if (!uf) {
      return { status: "ERRO", motivo: "UF do emitente não definida — necessária para resolver a autorizadora da NF-e." };
    }
    if ((input.correcao ?? "").trim().length < 15) {
      return { status: "ERRO", motivo: "A correção da CC-e deve ter ao menos 15 caracteres." };
    }

    try {
      const { privateKeyPem, certPem } = pfxToPem(ctx.certificado.pfx, ctx.certificado.senha);
      const evento = buildEventoCCe({
        ambiente: ctx.ambiente,
        cUF: cUFFromChave(chave),
        cnpj: cnpjFromChave(chave),
        chNFe: chave,
        xCorrecao: input.correcao,
        nSeqEvento: input.sequencia
      });
      const r = await enviarEvento(evento.xml, uf, ctx.ambiente, ctx.certificado, { privateKeyPem, certPem });
      return { status: r.status, protocolo: r.protocolo, motivo: r.motivo };
    } catch (e) {
      return { status: "ERRO", motivo: `Falha na carta de correção da NF-e: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async queryStatus(chaveAcesso: string, ctx: ProviderContext): Promise<EmitResult> {
    if (!ctx.certificado?.pfx) {
      return { status: "PROCESSANDO", motivo: "Certificado A1 não disponível para consultar a NF-e na SEFAZ." };
    }
    const chave = onlyDigitsStr(chaveAcesso);
    if (chave.length !== 44) {
      return { status: "PROCESSANDO", motivo: "Chave de acesso inválida para consulta de protocolo." };
    }
    const uf = (ctx.ufEmitente ?? "").trim();
    if (!uf) {
      return { status: "PROCESSANDO", motivo: "UF do emitente não definida — necessária para consultar a NF-e." };
    }
    try {
      const sit = await consultarProtocolo(chave, uf, ctx.ambiente, ctx.certificado);
      const motivo = `${sit.cStat ? `${sit.cStat} ` : ""}${sit.xMotivo}`.trim() || `HTTP ${sit.statusCode}`;
      // cStat 101 = nota cancelada (via consulta); demais usam o mapeamento de autorização.
      if (sit.cStat === "101") {
        return { status: "CANCELADA", chaveAcesso: chave, protocolo: sit.nProt, motivo };
      }
      const status = statusFromCStat(sit.cStat);
      if (status === "AUTORIZADA") {
        return { status, chaveAcesso: chave, protocolo: sit.nProt, providerRef: chave, motivo };
      }
      // Sem protNFe e cStat de processamento (105) ou vazio: a nota ainda está em processamento.
      if (!sit.protNFe && (sit.cStat === "" || sit.cStat === "105")) {
        return { status: "PROCESSANDO", chaveAcesso: chave, motivo };
      }
      return { status, chaveAcesso: chave, protocolo: sit.nProt, motivo };
    } catch (e) {
      return { status: "PROCESSANDO", motivo: `Falha ao consultar a NF-e na SEFAZ: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /**
   * Inutilização de faixa de numeração (NFeInutilizacao4). Fora do contrato FiscalProvider — método
   * EXTRA do provedor SEFAZ, para a camada de aplicação inutilizar números pulados/queimados. O CNPJ
   * do emitente não está no ProviderContext, então é recebido explicitamente. cStat 102 = homologada.
   */
  async inutilizar(
    params: { cnpj: string; ano: number; serie: number; nNFIni: number; nNFFin: number; justificativa: string; modelo?: string },
    ctx: ProviderContext
  ): Promise<InutilizacaoResult> {
    if (!ctx.certificado?.pfx) {
      return { status: "ERRO", motivo: "Certificado A1 não disponível para assinar/transmitir a inutilização." };
    }
    const uf = (ctx.ufEmitente ?? "").trim();
    if (!uf) {
      return { status: "ERRO", motivo: "UF do emitente não definida — necessária para resolver a autorizadora da NF-e." };
    }
    if ((params.justificativa ?? "").trim().length < 15) {
      return { status: "ERRO", motivo: "A justificativa de inutilização deve ter ao menos 15 caracteres." };
    }
    try {
      const { privateKeyPem, certPem } = pfxToPem(ctx.certificado.pfx, ctx.certificado.senha);
      return await inutilizarNumeracao(
        {
          ambiente: ctx.ambiente,
          uf,
          cnpj: params.cnpj,
          ano: params.ano,
          serie: params.serie,
          nNFIni: params.nNFIni,
          nNFFin: params.nNFFin,
          xJust: params.justificativa,
          modelo: params.modelo
        },
        ctx.certificado,
        { privateKeyPem, certPem }
      );
    } catch (e) {
      return { status: "ERRO", motivo: `Falha ao inutilizar numeração: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async testConnection(ctx: ProviderContext): Promise<TestConnectionResult> {
    if (!ctx.certificado?.pfx) {
      return { ok: false, message: "Certificado A1 não disponível para conectar na SEFAZ (configure o certificado da empresa)." };
    }
    const uf = ctx.ufEmitente?.trim();
    if (!uf) {
      return { ok: false, message: "UF do emitente não definida — necessária para resolver a autorizadora da NF-e." };
    }
    try {
      const r = await consultarStatusServico(uf, ctx.ambiente, ctx.certificado);
      if (r.cStat === "107") {
        return { ok: true, message: `SEFAZ ${uf} em operação${r.tMed ? ` (tempo médio ${r.tMed}s)` : ""}.` };
      }
      return { ok: false, message: `SEFAZ ${uf} respondeu cStat ${r.cStat || "?"}: ${r.xMotivo || `HTTP ${r.statusCode}`}.` };
    } catch (e) {
      return { ok: false, message: `Falha ao conectar na SEFAZ ${uf}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
