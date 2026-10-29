import PDFKit from "pdfkit";
import { formatDocumento } from "@/lib/fiscal/documento";
import { valorPorExtenso } from "@/lib/texto/valor-extenso";

/**
 * RECIBO DE PAGAMENTO (A4, duas vias na mesma folha: credor e devedor).
 *
 * É o documento da despesa SEM nota fiscal — autônomo, aluguel, acordo. Traz o que um recibo
 * precisa ter para servir de comprovante: quem recebeu (nome e CPF/CNPJ), de quem recebeu (a
 * empresa, com CNPJ), o valor em número e POR EXTENSO, a que se refere, a data, a forma de
 * pagamento e a linha de assinatura.
 *
 * Duas vias porque na prática uma fica com quem pagou e a outra, assinada, volta para o arquivo.
 */

export type ReciboPdfInput = {
  numero: number;
  empresa: { razaoSocial: string; cnpj?: string | null; endereco?: string | null; logoDataUrl?: string | null };
  favorecido: { nome: string; documento?: string | null };
  valor: number;
  referente: string;
  dataPagamento: Date;
  formaPagamento?: string | null;
  cidade?: string | null;
  observacao?: string | null;
};

const A4 = { largura: 595.28, altura: 841.89 };
const M = 42;
const UTIL = A4.largura - M * 2;
const LINHA = "#d7dbe0";
const MUTED = "#5c6470";
const INK = "#101828";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

function dataPorExtenso(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function logoBuffer(dataUrl?: string | null): Buffer | undefined {
  if (!dataUrl) return undefined;
  const m = /^data:image\/(?:png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return undefined;
  try {
    return Buffer.from(m[1], "base64");
  } catch {
    return undefined;
  }
}

/** Desenha uma via do recibo a partir de `topo`; devolve a altura usada. */
function via(doc: PDFKit.PDFDocument, input: ReciboPdfInput, topo: number, rotulo: string): number {
  const logo = logoBuffer(input.empresa.logoDataUrl);
  let y = topo;

  doc.save().rect(M, y, UTIL, 150).strokeColor(LINHA).lineWidth(1).stroke().restore();

  // Cabeçalho: logo + emitente (quem paga) + número do recibo.
  if (logo) {
    try {
      doc.image(logo, M + 10, y + 10, { fit: [70, 34] });
    } catch {
      /* imagem inválida não derruba o recibo */
    }
  }
  const xTexto = logo ? M + 90 : M + 12;
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(input.empresa.razaoSocial, xTexto, y + 12, { width: UTIL - 180 });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  const linhaEmpresa = [input.empresa.cnpj ? `CNPJ ${formatDocumento(input.empresa.cnpj)}` : "", input.empresa.endereco ?? ""]
    .filter(Boolean)
    .join(" · ");
  if (linhaEmpresa) doc.text(linhaEmpresa, xTexto, y + 27, { width: UTIL - 180 });

  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("RECIBO", M + UTIL - 150, y + 12, { width: 140, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`Nº ${String(input.numero).padStart(5, "0")}`, M + UTIL - 150, y + 29, { width: 140, align: "right" });
  doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text(brl(input.valor), M + UTIL - 150, y + 44, { width: 140, align: "right" });

  // Corpo: a declaração de recebimento.
  y += 70;
  doc.moveTo(M + 10, y).lineTo(M + UTIL - 10, y).strokeColor(LINHA).stroke();
  y += 10;

  const doc_fav = input.favorecido.documento ? `, inscrito(a) no CPF/CNPJ sob o nº ${formatDocumento(input.favorecido.documento)}` : "";
  const texto =
    `Recebi de ${input.empresa.razaoSocial}${input.empresa.cnpj ? ` (CNPJ ${formatDocumento(input.empresa.cnpj)})` : ""} ` +
    `a importância de ${brl(input.valor)} (${valorPorExtenso(input.valor)}), ` +
    `referente a ${input.referente}` +
    `${input.formaPagamento ? `, pago(a) via ${input.formaPagamento}` : ""}, ` +
    `dando plena e geral quitação pelo valor recebido.`;

  doc.font("Helvetica").fontSize(10).fillColor(INK).text(texto, M + 12, y, { width: UTIL - 24, align: "justify", lineGap: 2 });
  y = doc.y + 8;

  if (input.observacao) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED).text(input.observacao, M + 12, y, { width: UTIL - 24 });
    y = doc.y + 6;
  }

  // Local, data e assinatura.
  const local = input.cidade ? `${input.cidade}, ` : "";
  doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(`${local}${dataPorExtenso(input.dataPagamento)}.`, M + 12, y, { width: UTIL - 24 });

  const yAssinatura = topo + 118;
  doc.moveTo(M + 90, yAssinatura).lineTo(M + UTIL - 90, yAssinatura).strokeColor("#6b7280").stroke();
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(input.favorecido.nome, M + 90, yAssinatura + 5, { width: UTIL - 180, align: "center" });
  if (input.favorecido.documento) {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
      .text(`CPF/CNPJ ${formatDocumento(input.favorecido.documento)}${doc_fav ? "" : ""}`, M + 90, yAssinatura + 18, { width: UTIL - 180, align: "center" });
  }

  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(rotulo, M + 10, topo + 138, { width: UTIL - 20, align: "right" });

  return 150;
}

export async function gerarReciboPdf(input: ReciboPdfInput): Promise<Buffer> {
  const doc = new PDFKit({ size: "A4", margin: M });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const altura = via(doc, input, M, "1ª via — de quem recebeu");

  // Linha de corte entre as vias.
  const yCorte = M + altura + 26;
  doc.save().dash(3, { space: 3 }).moveTo(M, yCorte).lineTo(M + UTIL, yCorte).strokeColor("#9aa1ab").stroke().undash().restore();
  doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("✂ corte aqui", M, yCorte + 3, { width: UTIL, align: "center" });

  via(doc, input, yCorte + 18, "2ª via — de quem pagou");

  doc.end();
  return done;
}
