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

/**
 * Desenha uma via do recibo a partir de `topo` e devolve a altura usada.
 *
 * O layout FLUI: cada bloco começa onde o anterior terminou (`doc.y`), e a moldura só é traçada
 * no fim, com a altura real. Com posição fixa, um "referente a" mais longo passava por cima da
 * linha de assinatura.
 */
function via(doc: PDFKit.PDFDocument, input: ReciboPdfInput, topo: number, rotulo: string): number {
  const logo = logoBuffer(input.empresa.logoDataUrl);
  const padding = 12;
  const xConteudo = M + padding;
  const larguraConteudo = UTIL - padding * 2;

  // ── Cabeçalho: emitente (quem paga) à esquerda, número e valor à direita ──
  let y = topo + padding;
  if (logo) {
    try {
      doc.image(logo, xConteudo, y, { fit: [70, 32] });
    } catch {
      /* imagem inválida não derruba o recibo */
    }
  }
  const xTexto = logo ? xConteudo + 80 : xConteudo;
  const larguraEmitente = larguraConteudo - (logo ? 80 : 0) - 160;

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(input.empresa.razaoSocial, xTexto, y, { width: larguraEmitente });
  const linhaEmpresa = [input.empresa.cnpj ? `CNPJ ${formatDocumento(input.empresa.cnpj)}` : "", input.empresa.endereco ?? ""]
    .filter(Boolean)
    .join(" · ");
  if (linhaEmpresa) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(linhaEmpresa, xTexto, doc.y + 1, { width: larguraEmitente });
  }
  const fimEmitente = doc.y;

  const xDireita = M + UTIL - padding - 150;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("RECIBO", xDireita, y, { width: 150, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`Nº ${String(input.numero).padStart(5, "0")}`, xDireita, doc.y + 1, { width: 150, align: "right" });
  doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text(brl(input.valor), xDireita, doc.y + 3, { width: 150, align: "right" });

  y = Math.max(fimEmitente, doc.y, topo + 44) + 10;
  doc.moveTo(xConteudo, y).lineTo(M + UTIL - padding, y).strokeColor(LINHA).lineWidth(1).stroke();
  y += 10;

  // ── Declaração de recebimento ──
  const texto =
    `Recebi de ${input.empresa.razaoSocial}${input.empresa.cnpj ? ` (CNPJ ${formatDocumento(input.empresa.cnpj)})` : ""} ` +
    `a importância de ${brl(input.valor)} (${valorPorExtenso(input.valor)}), ` +
    `referente a ${input.referente}` +
    `${input.formaPagamento ? `, pago(a) via ${input.formaPagamento}` : ""}, ` +
    `dando plena e geral quitação pelo valor recebido.`;

  doc.font("Helvetica").fontSize(10).fillColor(INK).text(texto, xConteudo, y, { width: larguraConteudo, align: "justify", lineGap: 2 });
  y = doc.y + 6;

  if (input.observacao) {
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(MUTED).text(input.observacao, xConteudo, y, { width: larguraConteudo });
    y = doc.y + 6;
  }

  // ── Local e data ──
  const local = input.cidade ? `${input.cidade}, ` : "";
  doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(`${local}${dataPorExtenso(input.dataPagamento)}.`, xConteudo, y, { width: larguraConteudo });
  y = doc.y + 30; // respiro antes da assinatura

  // ── Assinatura ──
  const larguraAssinatura = Math.min(300, larguraConteudo);
  const xAssinatura = M + (UTIL - larguraAssinatura) / 2;
  doc.moveTo(xAssinatura, y).lineTo(xAssinatura + larguraAssinatura, y).strokeColor("#6b7280").stroke();
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(input.favorecido.nome, xAssinatura, y + 4, { width: larguraAssinatura, align: "center" });
  if (input.favorecido.documento) {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
      .text(`CPF/CNPJ ${formatDocumento(input.favorecido.documento)}`, xAssinatura, doc.y + 1, { width: larguraAssinatura, align: "center" });
  }
  y = doc.y + 6;

  // ── Rodapé da via e moldura com a altura real ──
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(rotulo, xConteudo, y, { width: larguraConteudo, align: "right" });
  const altura = doc.y + padding - topo;
  doc.save().rect(M, topo, UTIL, altura).strokeColor(LINHA).lineWidth(1).stroke().restore();
  return altura;
}

export async function gerarReciboPdf(input: ReciboPdfInput): Promise<Buffer> {
  const doc = new PDFKit({ size: "A4", margin: M });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const altura = via(doc, input, M, "1ª via — de quem recebeu");

  // Linha de corte entre as vias, abaixo da altura REAL da primeira.
  const yCorte = M + altura + 24;
  doc.save().dash(3, { space: 3 }).moveTo(M, yCorte).lineTo(M + UTIL, yCorte).strokeColor("#9aa1ab").stroke().undash().restore();
  doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("corte aqui", M, yCorte + 3, { width: UTIL, align: "center" });

  via(doc, input, yCorte + 18, "2ª via — de quem pagou");

  doc.end();
  return done;
}
