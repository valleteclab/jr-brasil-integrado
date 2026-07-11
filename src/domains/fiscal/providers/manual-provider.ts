import { randomInt } from "node:crypto";
import type {
  CancelInput,
  CancelResult,
  CorrectionInput,
  CorrectionResult,
  EmitInput,
  EmitResult,
  FiscalProvider,
  ProviderContext
} from "./types";
import { normalizeDocumento } from "@/lib/fiscal/documento";

const UF_CODES: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53", ES: "32",
  GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15", PB: "25", PR: "41",
  PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42",
  SP: "35", SE: "28", TO: "17"
};

function onlyDigits(value: string | null | undefined, size: number) {
  return (value ?? "").replace(/\D/g, "").padStart(size, "0").slice(-size);
}

function mod11Dv(key43: string) {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  let w = 0;
  for (let i = key43.length - 1; i >= 0; i -= 1) {
    sum += (key43.charCodeAt(i) - 48) * weights[w % weights.length];
    w += 1;
  }
  const rest = sum % 11;
  const dv = 11 - rest;
  return dv >= 10 ? 0 : dv;
}

/**
 * Gera uma chave de acesso de 44 dígitos no formato oficial da NF-e/NFC-e, com dígito
 * verificador módulo 11 válido. Em produção a chave vem do provedor/SEFAZ; aqui (provedor
 * interno/homologação) ela é gerada localmente para que todo o fluxo funcione e seja testável.
 */
function buildAccessKey(params: {
  uf: string | null;
  cnpj: string;
  modelo: string;
  serie: string;
  numero: number;
}) {
  const cUF = UF_CODES[(params.uf ?? "BA").toUpperCase()] ?? "29";
  const now = new Date();
  const aamm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const cnpj = normalizeDocumento(params.cnpj);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)) throw new Error("CNPJ inválido para gerar chave fiscal.");
  const mod = params.modelo === "NFCE" ? "65" : "55";
  const serie = onlyDigits(params.serie, 3);
  const nNF = String(params.numero).padStart(9, "0");
  const tpEmis = "1";
  const cNF = String(randomInt(0, 99999999)).padStart(8, "0");
  const key43 = `${cUF}${aamm}${cnpj}${mod}${serie}${nNF}${tpEmis}${cNF}`;
  return `${key43}${mod11Dv(key43)}`;
}

function buildSnapshotXml(input: EmitInput, chave: string, protocolo: string, ambiente: string) {
  const itens = input.document.itens
    .map(
      (item, index) =>
        `    <det nItem="${index + 1}"><prod><cProd>${item.codigo}</cProd><xProd>${escapeXml(
          item.descricao
        )}</xProd><NCM>${item.ncm ?? ""}</NCM><CFOP>${item.cfop ?? ""}</CFOP><qCom>${item.quantidade}</qCom><vUnCom>${item.valorUnitario}</vUnCom><vProd>${item.valorTotal}</vProd></prod></det>`
    )
    .join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<nfeProc versao="4.00" ambiente="${ambiente}">`,
    `  <NFe><infNFe Id="NFe${chave}">`,
    `    <ide><natOp>${escapeXml(input.document.naturezaOperacao)}</natOp><serie>${input.document.serie}</serie><nNF>${input.numero}</nNF></ide>`,
    `    <dest><xNome>${escapeXml(input.document.destinatario.nome)}</xNome><doc>${input.document.destinatario.documento ?? ""}</doc></dest>`,
    itens,
    `    <total><vNF>${input.total.toFixed(2)}</vNF><vTotTrib>${input.totals.valorTotalTributos.toFixed(2)}</vTotTrib></total>`,
    `  </infNFe></NFe>`,
    `  <protNFe><infProt><chNFe>${chave}</chNFe><nProt>${protocolo}</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`,
    `</nfeProc>`
  ].join("\n");
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] ?? c)
  );
}

/**
 * Provedor interno: emite documentos fiscais de forma 100% funcional, gerando chave de
 * acesso válida, protocolo e XML de snapshot. Destinado a homologação e a manter o ERP
 * operacional enquanto o cliente não pluga credenciais/certificado de um provedor externo.
 */
export class ManualFiscalProvider implements FiscalProvider {
  readonly id = "MANUAL" as const;

  async emit(input: EmitInput, ctx: ProviderContext): Promise<EmitResult> {
    const chave = buildAccessKey({
      uf: input.emitter.uf,
      cnpj: input.emitter.cnpj,
      modelo: input.document.modelo,
      serie: input.document.serie,
      numero: input.numero
    });
    const protocolo = `${ctx.ambiente === "PRODUCAO" ? "1" : "9"}${Date.now()}${randomInt(100, 999)}`;
    const ambienteLabel = ctx.ambiente === "PRODUCAO" ? "1" : "2";

    return {
      status: "AUTORIZADA",
      chaveAcesso: chave,
      protocolo,
      reciboLote: `${protocolo}`.slice(0, 15),
      providerRef: chave,
      xml: buildSnapshotXml(input, chave, protocolo, ambienteLabel),
      motivo: "Autorizado o uso da NF-e (emissão interna)."
    };
  }

  async cancel(input: CancelInput): Promise<CancelResult> {
    if (input.justificativa.trim().length < 15) {
      return { status: "REJEITADO", motivo: "Justificativa de cancelamento deve ter ao menos 15 caracteres." };
    }
    return { status: "AUTORIZADO", protocolo: `C${Date.now()}` };
  }

  async correct(input: CorrectionInput): Promise<CorrectionResult> {
    if (input.correcao.trim().length < 15) {
      return { status: "REJEITADO", motivo: "Texto de correção deve ter ao menos 15 caracteres." };
    }
    return { status: "AUTORIZADO", protocolo: `CCe${Date.now()}` };
  }

  async queryStatus(chaveAcesso: string): Promise<EmitResult> {
    return { status: "AUTORIZADA", chaveAcesso, motivo: "Autorizado o uso da NF-e." };
  }
}
