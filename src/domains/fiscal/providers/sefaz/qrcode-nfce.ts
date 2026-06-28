/**
 * QR Code da NFC-e (modelo 65) — NT 2015.002, QR Code versão 2 (emissão ONLINE/normal).
 *
 * Monta a URL do `<qrCode>` do grupo `infNFeSupl` e o `<urlChave>`. O hash é SHA-1 da querystring
 * (sem o `?` e sem o par cHashQRCode) com o **CSC** colado no final — o CSC NUNCA aparece na URL,
 * só o `cIdToken` (idCSC) e o hash. CSC e idCSC vêm do CADASTRO da empresa (nada hardcoded); as URLs
 * de consulta são por UF/ambiente.
 *
 * Contingência offline (tpEmis=9) acrescenta dhEmi/vNF/vICMS/digVal — não implementado aqui (a NFC-e
 * online cobre o fluxo normal; contingência entra quando necessário).
 */
import { createHash } from "node:crypto";
import type { AmbienteFiscal } from "@prisma/client";

export type NfceQrUrls = { qrCode: string; urlChave: string };

// URLs de consulta da NFC-e por UF e ambiente. `qrCode` = base do qrcode.aspx (recebe a querystring);
// `urlChave` = página de consulta por chave (vai cru no <urlChave>). Tratar como configurável: as UFs
// publicam no PDF de config do emissor e já mudaram no passado — reconfirmar ao habilitar cada UF.
const NFCE_URLS: Partial<Record<string, Record<AmbienteFiscal, NfceQrUrls>>> = {
  // URLs confirmadas no ACBrNFeServicos.ini (HTTP, não HTTPS — a SVRS rejeita (cStat 395) se divergir).
  BA: {
    PRODUCAO: {
      qrCode: "http://nfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx",
      urlChave: "http://www.sefaz.ba.gov.br/nfce/consulta"
    },
    HOMOLOGACAO: {
      qrCode: "http://hnfe.sefaz.ba.gov.br/servicos/nfce/qrcode.aspx",
      urlChave: "http://hinternet.sefaz.ba.gov.br/nfce/consulta"
    }
  }
};

/** URLs de QR Code/consulta para a UF + ambiente. Lança se a UF ainda não foi configurada. */
export function resolveNfceUrls(uf: string, ambiente: AmbienteFiscal): NfceQrUrls {
  const sigla = (uf ?? "").trim().toUpperCase();
  const porAmbiente = NFCE_URLS[sigla];
  if (!porAmbiente) {
    throw new Error(`URLs de QR Code da NFC-e não configuradas para a UF ${sigla || "(vazia)"}.`);
  }
  return porAmbiente[ambiente];
}

export type NfceQrInput = {
  chave: string;          // 44 dígitos (sem prefixo "NFe")
  tpAmb: "1" | "2";       // 1=produção, 2=homologação
  idCsc: string;          // identificador do CSC (idCSC) — do cadastro; SEM zeros à esquerda no QR
  csc: string;            // valor secreto do CSC — do cadastro; NUNCA vai na URL, só no hash
  uf: string;             // UF do emitente
  ambiente: AmbienteFiscal;
};

/**
 * Monta o `<qrCode>` e o `<urlChave>` da NFC-e — formato PIPE versão 2, emissão ONLINE (o XSD
 * 4.00/NT 2025.002 só aceita esse formato para a NFC-e online; o querystring `?chNFe=...&nVersao=...`
 * é da NF-e antiga). Estrutura: `?p=<chave>|2|<tpAmb>|<idCSC>|<hash>` com
 * `hash = UPPER(HEX(SHA1("<chave>|2|<tpAmb>|<idCSC>" + CSC)))`. O idCSC vai SEM zeros à esquerda.
 */
export function buildNfceQrCode(input: NfceQrInput): NfceQrUrls {
  const urls = resolveNfceUrls(input.uf, input.ambiente);
  const idCsc = (String(input.idCsc).replace(/\D/g, "").replace(/^0+/, "")) || "0";
  const chave = String(input.chave).replace(/\D/g, "");
  const dados = `${chave}|2|${input.tpAmb}|${idCsc}`;
  const hash = createHash("sha1").update(dados + input.csc, "utf8").digest("hex").toUpperCase();
  return { qrCode: `${urls.qrCode}?p=${dados}|${hash}`, urlChave: urls.urlChave };
}
