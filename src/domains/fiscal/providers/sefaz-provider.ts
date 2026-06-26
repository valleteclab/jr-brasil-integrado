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
import { cUFFromUF, resolveSefazEndpoints } from "./sefaz/endpoints";
import { NFE_NS, WSDL_NS, pickBlock, pickTag, postSoap, soapEnvelope } from "./sefaz/soap";
import { buildNfeXml } from "./sefaz/nfe-xml";
import { pfxToPem, signNfe } from "./sefaz/sign";

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
  const res = await postSoap(endpoints.statusServico, envelope, cert);
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
    if (input.document.modelo === "NFCE") {
      // NFC-e exige QR Code + CSC e DANFCE — fica para fase posterior.
      return { status: "ERRO", motivo: "Emissão de NFC-e direto na SEFAZ ainda não implementada (NF-e modelo 55 primeiro)." };
    }
    if (!ctx.certificado?.pfx) {
      return { status: "ERRO", motivo: "Certificado A1 não disponível para assinar/transmitir a NF-e." };
    }
    const uf = (ctx.ufEmitente ?? input.emitter.uf ?? "").trim();
    if (!uf) {
      return { status: "ERRO", motivo: "UF do emitente não definida — necessária para resolver a autorizadora da NF-e." };
    }

    let chave: string;
    let signed: string;
    try {
      const built = buildNfeXml(input);
      chave = built.chave;
      const { privateKeyPem, certPem } = pfxToPem(ctx.certificado.pfx, ctx.certificado.senha);
      signed = signNfe(built.xml, privateKeyPem, certPem);
    } catch (e) {
      return { status: "ERRO", motivo: `Falha ao montar/assinar a NF-e: ${e instanceof Error ? e.message : String(e)}` };
    }

    // Lote síncrono (indSinc=1): a SEFAZ devolve o protNFe direto no retorno.
    const idLote = chave.slice(-15);
    const enviNFe =
      `<enviNFe versao="4.00" xmlns="${NFE_NS}">` +
      `<idLote>${idLote}</idLote><indSinc>1</indSinc>${signed}` +
      `</enviNFe>`;
    const endpoints = resolveSefazEndpoints(uf, ctx.ambiente);
    const res = await postSoap(endpoints.autorizacao, soapEnvelope(WSDL_NS.autorizacao, enviNFe), ctx.certificado);

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

  async cancel(_input: CancelInput, _ctx: ProviderContext): Promise<CancelResult> {
    // F3: evento 110111 via RecepcaoEvento4.
    return { status: "ERRO", motivo: "Cancelamento NF-e (SEFAZ) ainda não implementado (F3)." };
  }

  async correct(_input: CorrectionInput, _ctx: ProviderContext): Promise<CorrectionResult> {
    // F3: evento 110110 (CC-e) via RecepcaoEvento4.
    return { status: "ERRO", motivo: "Carta de correção NF-e (SEFAZ) ainda não implementada (F3)." };
  }

  async queryStatus(_chaveAcesso: string, _ctx: ProviderContext): Promise<EmitResult> {
    // F3: NFeConsultaProtocolo4.
    return { status: "PROCESSANDO", motivo: "Consulta de protocolo NF-e (SEFAZ) ainda não implementada (F3)." };
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
