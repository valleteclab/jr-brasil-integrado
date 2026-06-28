/**
 * Desenho das linhas de itens do DANFE — FORK de `gerar-itens` da lib nfe-danfe-pdf. Idêntico ao
 * upstream EXCETO: (1) importa o `criaLayout` deste módulo (que injeta o quadro IBS/CBS); (2) omite
 * o grupo de rastreabilidade (lote/validade), que dependia de `ordate` e não usamos. Demais helpers
 * vêm da lib por deep-import.
 */
import { formatNumber } from "nfe-danfe-pdf/lib/domain/use-cases/utils";
import { DEFAULT_NFE } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/default";
import { linhaHorizontalTracejada } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/linha-horizontal-tracejada";
import { normal } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/normal";
import { optionsDocNFe } from "nfe-danfe-pdf/lib/application/helpers/generate-pdf/nfe/options-doc";
import { criaLayout } from "./cria-layout";

export async function gerarItens(args: any): Promise<void> {
  const { nf, ajusteX, ajusteY, doc, margemEsquerda, margemTopo, margemDireita, larguraDoFormulario, pathLogo, cancelada, textoRodape } = args;
  let folha = 0;
  await criaLayout({ ajusteX, ajusteY, nf, doc, larguraDoFormulario, margemDireita, margemEsquerda, margemTopo, pathLogo, folha, cancelada, textoRodape });

  let maiorY = doc.y;
  for (let i = 0; i < nf.NFe.infNFe.det.length; i++) {
    const item = nf.NFe.infNFe.det[i];

    function renderizarLinha(pdf: any): number {
      const y = maiorY + 2;
      const t = DEFAULT_NFE.tamanhoDaFonteDosItens;
      const N = (value: string, x: number, largura: number, alinhamento: string = "center", yy: number = y) =>
        normal({ doc, value, x, y: yy, largura, alinhamento, tamanho: t, ajusteX, ajusteY, margemEsquerda, margemTopo });

      N(item.prod.cProd, 1.5, 51);
      N(`${item.prod.xProd}${item.infAdProd ? `\n${item.infAdProd}` : ""}`, 55.5, 178, "justify");
      maiorY = Math.max(maiorY, pdf.y);
      N(item.prod.NCM, 235.5, 32.5); maiorY = Math.max(maiorY, pdf.y);
      N(item.prod.CFOP, 293.5, 21); maiorY = Math.max(maiorY, pdf.y);
      N(item.prod.uCom, 315.5, 16.5); maiorY = Math.max(maiorY, pdf.y);
      N(formatNumber(item.prod.qCom, 4), 335, 37); maiorY = Math.max(maiorY, pdf.y);
      N(formatNumber(item.prod.vUnCom, 2), 375, 32.5); maiorY = Math.max(maiorY, pdf.y);
      N(formatNumber(item.prod.vProd, 2), 409.5, 31); maiorY = Math.max(maiorY, pdf.y);

      const keys = Object.keys(item.imposto ?? {});
      for (let k = 0; k < keys.length; k++) {
        if (keys[k].includes("ICMS") && !keys[k].includes("UFDest")) {
          const newKeys = Object.keys(item.imposto[keys[k]]);
          const g = item.imposto[keys[k]][newKeys[0]];
          N(g.CST ? `${g.orig}/${g.CST}` : "", 270, 21);
          N(g.CSOSN ? `${g.orig}/${g.CSOSN}` : "", 270, 21);
          maiorY = Math.max(maiorY, pdf.y);
          N(formatNumber(g.vBC ?? 0, 2), 443, 32.5); maiorY = Math.max(maiorY, pdf.y);
          N(formatNumber(g.vICMS ?? 0, 2), 476, 32); maiorY = Math.max(maiorY, pdf.y);
          N(formatNumber(g.pICMS ?? 0, 2), 532, 28, "center", y + 0.65); maiorY = Math.max(maiorY, pdf.y);
        }
      }

      N(formatNumber(item.imposto?.IPI?.IPITrib?.vIPI ?? 0, 2), 507.5, 26); maiorY = Math.max(maiorY, pdf.y);
      N(formatNumber(item.imposto?.IPI?.IPITrib?.pIPI ?? 0, 2), 557.75, 29); maiorY = Math.max(maiorY, pdf.y);
      return Number(maiorY) + (DEFAULT_NFE.separadorDeItens !== undefined ? 2 : 0);
    }

    maiorY = renderizarLinha(doc);
    if (doc.y > (folha === 0 ? DEFAULT_NFE.finalTamanhoDet1 - 26 : 800)) {
      doc.addPage(optionsDocNFe);
      doc.y = 0;
      folha++;
      await criaLayout({ ajusteX, ajusteY, nf, doc, larguraDoFormulario, margemDireita, margemEsquerda, margemTopo, pathLogo, folha, cancelada, textoRodape });
      maiorY = doc.y;
    } else if (DEFAULT_NFE.separadorDeItens !== undefined) {
      linhaHorizontalTracejada({ x1: 0, x2: 0, y: maiorY - 1, doc, ajusteX, ajusteY, margemDireita, margemEsquerda, margemTopo });
    }
  }
}
