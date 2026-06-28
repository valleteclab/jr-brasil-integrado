/**
 * Gerador do DANFCE (cupom da NFC-e, modelo 65) em PDF — sobre a lib nfe-danfe-pdf.
 *
 * Diferente do DANFE (55), aqui NÃO precisamos de fork: a lib já desenha o cupom 80mm completo e
 * renderiza o QR Code a partir do `infNFeSupl/qrCode` do nosso XML. Usamos `gerarPDF`, que roteia o
 * `mod`=65 para o gerador de NFC-e. As fontes (Roboto Condensed) da lib já entram no standalone via
 * `outputFileTracingIncludes` (`nfe-danfe-pdf/lib/**`) e pdfkit é external (ver next.config.mjs).
 *
 * Entrada: XML do `nfeProc` (NFC-e + protNFe) autorizado. Saída: Buffer de PDF (application/pdf).
 */
import { gerarPDF } from "nfe-danfe-pdf";

export async function gerarDanfcePdf(nfeProcXml: string): Promise<Buffer> {
  const doc = await gerarPDF(nfeProcXml); // mod 65 → cupom NFC-e com QR Code do infNFeSupl
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
