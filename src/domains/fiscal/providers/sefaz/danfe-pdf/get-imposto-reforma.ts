/**
 * Quadro "Cálculo dos Tributos da Reforma (IBS / CBS / IS)" do DANFE — NT 2025.002.
 *
 * Espelha o estilo do `getImposto` da lib nfe-danfe-pdf (mesmos helpers de desenho e o mesmo
 * contrato de `y` propagado: recebe a posição vertical corrente e devolve a nova). Só desenha
 * quando o XML traz o totalizador `IBSCBSTot`; sem ele, devolve `y` inalterado (nota pré-Reforma).
 */
// Helpers de desenho reaproveitados da lib (deep-import — ver README do módulo).
import { campo } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/campo";
import { titulo } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/titulo";
import { secao } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/secao";
import { linhaVertical } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/linha-vertical";

type ReformaInput = {
  y: number;
  doc: PDFKit.PDFDocument;
  ajusteX: number;
  ajusteY: number;
  margemEsquerda: number;
  margemTopo: number;
  larguraDoFormulario: number;
  total: any;
};

/** "479.80" | "479,80" | number → "479.80" com 2 casas (formato monetário do DANFE). */
function fmt(v: unknown): string {
  const n = Number(String(v ?? "0").replace(",", "."));
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

export function getImpostoReforma({
  y,
  doc,
  ajusteX,
  ajusteY,
  margemEsquerda,
  margemTopo,
  larguraDoFormulario,
  total
}: ReformaInput): number {
  const tot = total?.IBSCBSTot;
  if (!tot) return y; // nota sem Reforma → não desenha o quadro

  const colunas: Array<[string, unknown]> = [
    ["BASE CÁLC. IBS/CBS", tot.vBCIBSCBS],
    ["IBS ESTADUAL (UF)", tot.gIBS?.gIBSUF?.vIBSUF],
    ["IBS MUNICIPAL", tot.gIBS?.gIBSMun?.vIBSMun],
    ["VALOR TOTAL DO IBS", tot.gIBS?.vIBS],
    ["VALOR DA CBS", tot.gCBS?.vCBS],
    ["IMPOSTO SELETIVO (IS)", total?.ISTot?.vIS]
  ];

  // Retângulo da seção (1 linha de 6 colunas, altura 20).
  doc
    .lineWidth(0.5)
    .roundedRect(margemEsquerda + ajusteX, margemTopo + ajusteY + y + 16.2, larguraDoFormulario, 20, 3)
    .stroke()
    .lineWidth(1);

  const col = larguraDoFormulario / 6;
  for (let i = 1; i < 6; i++) {
    linhaVertical({ y1: y + 16.2, y2: y + 36.2, x: col * i, doc, ajusteX, ajusteY, margemEsquerda, margemTopo });
  }

  secao({
    doc,
    value: "Cálculo dos Tributos da Reforma (IBS / CBS / IS - NT 2025.002)",
    x: 1.5,
    y: y + 8.7,
    largura: 0,
    ajusteX,
    ajusteY,
    margemEsquerda,
    margemTopo
  });

  colunas.forEach(([label, valor], i) => {
    const x = i * col + 1.5;
    titulo({ value: label, x, y: y + 17.2, largura: col - 2, ajusteX, ajusteY, doc, margemEsquerda, margemTopo });
    campo({
      value: fmt(valor),
      x,
      y: y + 25.5,
      largura: col - 3,
      alinhamento: "right",
      ajusteX,
      ajusteY,
      doc,
      margemEsquerda,
      margemTopo
    });
  });

  return doc.y;
}
