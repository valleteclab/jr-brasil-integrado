/**
 * Gerador de DANFE em PDF (NF-e modelo 55) no padrão MOC, sobre a lib nfe-danfe-pdf (PDFKit).
 *
 * Por que um wrapper e não a lib direta:
 *  - Adicionamos o quadro IBS/CBS/IS da Reforma (NT 2025.002), que a lib ainda não desenha — via
 *    fork mínimo de `gerar-itens`/`cria-layout` (os demais helpers vêm da lib por deep-import).
 *  - Trocamos as fontes TTF da lib pelas fontes BUILT-IN do PDFKit (Times-*). O build Next é
 *    `standalone` e não traça assets lidos por `fs` em runtime, então as TTF da lib não chegariam
 *    à imagem; as built-in não dependem de arquivo e renderem acentos (WinAnsi) corretamente.
 *
 * Entrada: XML do `nfeProc` (NF-e + protNFe) autorizado. Saída: Buffer de PDF (application/pdf).
 */
import PDFKit from "pdfkit";
import { deserializeXml } from "nfe-danfe-pdf/lib/application/helpers/xml";
import { optionsDocNFe } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/options-doc";
import { italico } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/italico";
import { gerarItens } from "./gerar-itens";

const margemTopo = 2.8;
const margemEsquerda = 3;
const margemDireita = 589.65;
const larguraDoFormulario = margemDireita - margemEsquerda;

/** Fontes built-in do PDFKit (sem TTF) — sobrepõem o loadFonts da lib (ver cabeçalho). */
function loadFontsBuiltin(doc: PDFKit.PDFDocument): void {
  doc.registerFont("normal", "Times-Roman");
  doc.registerFont("negrito", "Times-Bold");
  doc.registerFont("italico", "Times-Italic");
  doc.registerFont("negrito-italico", "Times-BoldItalic");
}

export type DanfePdfOptions = { logoDataUrl?: string | null; cancelada?: boolean; textoRodape?: string };

/** Data URL (PNG/JPEG) → Buffer para o PDFKit `doc.image`. Outros formatos (ex.: SVG) → sem logo. */
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

export async function gerarDanfePdf(nfeProcXml: string, opcoes?: DanfePdfOptions): Promise<Buffer> {
  const parsed: any = await deserializeXml(nfeProcXml);
  const nf = parsed.nfeProc;
  // A lib espera arrays nesses grupos repetíveis (xml2js entrega objeto quando há 1 ocorrência).
  if (!(nf.NFe.infNFe.det instanceof Array)) nf.NFe.infNFe.det = [nf.NFe.infNFe.det];
  if (nf.NFe.infNFe.pag && !(nf.NFe.infNFe.pag.detPag instanceof Array)) nf.NFe.infNFe.pag.detPag = [nf.NFe.infNFe.pag.detPag];
  if (nf.NFe.infNFe.cobr?.dup !== undefined && !(nf.NFe.infNFe.cobr.dup instanceof Array)) nf.NFe.infNFe.cobr.dup = [nf.NFe.infNFe.cobr.dup];

  const doc = new PDFKit(optionsDocNFe as any);
  loadFontsBuiltin(doc);

  await gerarItens({
    ajusteX: 0,
    ajusteY: 0,
    nf,
    doc,
    larguraDoFormulario,
    margemDireita,
    margemEsquerda,
    margemTopo,
    pathLogo: logoBuffer(opcoes?.logoDataUrl),
    cancelada: opcoes?.cancelada,
    textoRodape: opcoes?.textoRodape
  });

  // Rodapé "FOLHA x/y" em cada página gerada.
  const paginas = doc.bufferedPageRange();
  for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
    doc.switchToPage(i);
    italico({
      doc,
      value: `FOLHA ${i + 1}/${paginas.start + paginas.count}`,
      x: 241.2,
      y: i === 0 ? 141.2 : 97.4,
      largura: 98.5,
      alinhamento: "center",
      tamanho: 8,
      ajusteX: 0,
      ajusteY: 0,
      margemEsquerda,
      margemTopo
    });
  }
  doc.flushPages();

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
