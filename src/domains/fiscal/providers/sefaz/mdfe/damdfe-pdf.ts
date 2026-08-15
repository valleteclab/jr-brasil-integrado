import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/**
 * DAMDFE (Documento Auxiliar do MDF-e, modelo 58) — A4 retrato, 1 página, pdfkit puro.
 * O motorista viaja com este documento: chave de acesso, QR Code (consulta pública),
 * protocolo de autorização, veículo/condutor, trajeto e resumo da carga.
 */

export type DamdfeData = {
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  chave: string;
  protocolo: string | null;
  autorizadoEm: string | null;
  serie: number;
  numero: number;
  status: string;
  emitente: { razaoSocial: string; cnpj: string; inscricaoEstadual: string | null; municipio: string | null; uf: string | null };
  ufInicio: string;
  ufFim: string;
  municipioCarrega: string;
  municipioDescarga: string;
  veiculoPlaca: string;
  veiculoTara: number;
  condutorNome: string;
  condutorCpf: string;
  chavesNfe: string[];
  valorCarga: number;
  pesoBrutoKg: number;
  /** URL do QR (infMDFeSupl/qrCodMDFe do XML autorizado). */
  qrCodeUrl: string | null;
};

const fmtChave = (c: string) => c.replace(/(\d{4})/g, "$1 ").trim();
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtCpf = (c: string) => c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const fmtCnpj = (c: string) => c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

export async function gerarDamdfePdf(d: DamdfeData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 28 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const fim = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const W = doc.page.width - 56; // largura útil
  const X = 28;
  let y = 28;

  const box = (x: number, yy: number, w: number, h: number) => doc.rect(x, yy, w, h).lineWidth(0.7).stroke("#000");
  const label = (t: string, x: number, yy: number) => doc.font("Helvetica").fontSize(5.5).fillColor("#333").text(t.toUpperCase(), x + 3, yy + 2);
  const value = (t: string, x: number, yy: number, opts: { size?: number; bold?: boolean; w?: number } = {}) =>
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size ?? 8.5).fillColor("#000")
      .text(t, x + 3, yy + 9, { width: (opts.w ?? 200) - 6, lineBreak: false });

  // ── Cabeçalho ──
  box(X, y, W, 46);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000").text("DAMDFE", X, y + 6, { width: W, align: "center" });
  doc.font("Helvetica").fontSize(7.5).text("Documento Auxiliar do Manifesto Eletrônico de Documentos Fiscais", X, y + 20, { width: W, align: "center" });
  doc.fontSize(7).text(`Modelo 58 · Série ${d.serie} · Número ${d.numero} · Modal Rodoviário`, X, y + 32, { width: W, align: "center" });
  y += 50;

  if (d.ambiente === "HOMOLOGACAO") {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#b00")
      .text("AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL", X, y, { width: W, align: "center" });
    y += 14;
    doc.fillColor("#000");
  }

  // ── Emitente ──
  box(X, y, W, 30);
  label("Emitente", X, y);
  value(`${d.emitente.razaoSocial}  ·  CNPJ ${fmtCnpj(d.emitente.cnpj)}${d.emitente.inscricaoEstadual ? `  ·  IE ${d.emitente.inscricaoEstadual}` : ""}`, X, y, { w: W, bold: true });
  doc.font("Helvetica").fontSize(7.5).text(`${d.emitente.municipio ?? ""}${d.emitente.uf ? ` / ${d.emitente.uf}` : ""}`, X + 3, y + 20);
  y += 34;

  // ── Chave + QR ──
  const qrSize = 88;
  box(X, y, W - qrSize - 6, 58);
  label("Chave de acesso", X, y);
  doc.font("Helvetica-Bold").fontSize(9.5).text(fmtChave(d.chave), X + 3, y + 12, { width: W - qrSize - 12 });
  label("Protocolo de autorização", X, y + 30);
  doc.font("Helvetica").fontSize(8.5).text(
    d.protocolo ? `${d.protocolo}${d.autorizadoEm ? `  em  ${new Date(d.autorizadoEm).toLocaleString("pt-BR")}` : ""}` : "—",
    X + 3, y + 40
  );
  if (d.qrCodeUrl) {
    const png = await QRCode.toBuffer(d.qrCodeUrl, { margin: 0, width: qrSize });
    doc.image(png, X + W - qrSize, y - 2, { width: qrSize, height: qrSize });
  }
  y += 62;
  if (d.qrCodeUrl) y = Math.max(y, 28 + 50 + (d.ambiente === "HOMOLOGACAO" ? 14 : 0) + 34 + qrSize + 2);

  // ── Trajeto / Veículo / Condutor ──
  const col = (W - 0) / 3;
  box(X, y, col, 28); label("Trajeto (UF início → UF fim)", X, y); value(`${d.ufInicio}  →  ${d.ufFim}`, X, y, { bold: true, w: col });
  box(X + col, y, col, 28); label("Carregamento", X + col, y); value(d.municipioCarrega, X + col, y, { w: col });
  box(X + col * 2, y, col, 28); label("Descarregamento", X + col * 2, y); value(d.municipioDescarga, X + col * 2, y, { w: col });
  y += 28;
  box(X, y, col, 28); label("Placa do veículo", X, y); value(d.veiculoPlaca, X, y, { bold: true, w: col });
  box(X + col, y, col, 28); label("Tara (kg)", X + col, y); value(String(d.veiculoTara), X + col, y, { w: col });
  box(X + col * 2, y, col, 28); label("Condutor", X + col * 2, y); value(`${d.condutorNome} · ${fmtCpf(d.condutorCpf)}`, X + col * 2, y, { w: col });
  y += 28;

  // ── Totais ──
  box(X, y, col, 28); label("Qtde. NF-e", X, y); value(String(d.chavesNfe.length), X, y, { bold: true, w: col });
  box(X + col, y, col, 28); label("Valor total da carga", X + col, y); value(brl(d.valorCarga), X + col, y, { bold: true, w: col });
  box(X + col * 2, y, col, 28); label("Peso bruto (kg)", X + col * 2, y); value(d.pesoBrutoKg.toLocaleString("pt-BR", { maximumFractionDigits: 3 }), X + col * 2, y, { w: col });
  y += 32;

  // ── NF-e transportadas ──
  box(X, y, W, 14 + d.chavesNfe.length * 12 + 4);
  label(`Documentos fiscais transportados (${d.chavesNfe.length} NF-e)`, X, y);
  let yy = y + 12;
  doc.font("Courier").fontSize(8);
  for (const ch of d.chavesNfe) {
    doc.text(fmtChave(ch), X + 6, yy, { lineBreak: false });
    yy += 12;
  }
  y = yy + 8;

  // ── Rodapé ──
  doc.font("Helvetica").fontSize(6.5).fillColor("#444").text(
    `Consulta pelo QR Code ou em https://dfe-portal.svrs.rs.gov.br/Mdfe · Status: ${d.status} · Emitido pelo XERP`,
    X, doc.page.height - 40, { width: W, align: "center" }
  );

  doc.end();
  return fim;
}
