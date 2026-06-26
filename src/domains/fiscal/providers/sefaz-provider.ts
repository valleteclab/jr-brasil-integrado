/**
 * Provedor SEFAZ — emissão de NF-e (modelo 55) DIRETO nos web services da SEFAZ, sem intermediário
 * e sem API paga. Autorizadora inicial: SVRS (cobre 16 UFs). Reaproveita a infraestrutura do
 * provedor NACIONAL (certificado A1 criptografado, assinatura XMLDSig, TLS-mútuo), trocando
 * REST/JSON por SOAP/XML do leiaute 4.00.
 *
 * F0 (esta entrega): transporte SOAP + TLS-mútuo validados ponta a ponta via NFeStatusServico4
 * (testConnection), SEM montar NF-e. emit/cancel/correct/queryStatus entram nas fases seguintes
 * (ver docs/provider-sefaz-nfe-design.md).
 */
import type { AmbienteFiscal, ProvedorFiscal } from "@prisma/client";
import type {
  CancelInput, CancelResult, CorrectionInput, CorrectionResult,
  EmitInput, EmitResult, FiscalProvider, ProviderContext, TestConnectionResult
} from "./types";
import { cUFFromUF, resolveSefazEndpoints } from "./sefaz/endpoints";
import { NFE_NS, WSDL_NS, pickTag, postSoap, soapEnvelope } from "./sefaz/soap";

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

  async emit(input: EmitInput, _ctx: ProviderContext): Promise<EmitResult> {
    if (input.document.modelo === "NFSE") {
      return { status: "ERRO", motivo: "O provedor SEFAZ emite apenas NF-e/NFC-e (NFS-e segue pelo NACIONAL/ACBr)." };
    }
    // F1: buildChaveAcesso + buildNfeXml (4.00) + assinar + NFeAutorizacao4 (indSinc=1) + parse cStat=100.
    return { status: "ERRO", motivo: "Emissão NF-e direto na SEFAZ ainda não implementada (F1)." };
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
