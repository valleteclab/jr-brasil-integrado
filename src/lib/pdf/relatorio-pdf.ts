import PDFKit from "pdfkit";

/**
 * Gerador GENÉRICO de relatório em PDF (A4) com a identidade do cliente: logotipo + razão social/
 * CNPJ no cabeçalho, título e período, faixa de KPIs, seções com tabelas (zebra, quebra de página
 * automática) e rodapé com data de geração e numeração. Fontes built-in do PDFKit (Helvetica) —
 * sem TTF externa (build standalone, mesmo motivo do DANFE).
 */

export type RelatorioKpi = { label: string; valor: string };

export type RelatorioColuna = {
  label: string;
  /** Peso relativo da largura (default 1). */
  peso?: number;
  align?: "left" | "right";
};

export type RelatorioSecao = {
  titulo?: string;
  texto?: string;
  tabela?: {
    colunas: RelatorioColuna[];
    linhas: string[][];
    /** Linha de total (opcional, desenhada em negrito ao final). */
    total?: string[];
  };
};

export type RelatorioPdfInput = {
  titulo: string;
  subtitulo?: string | null;
  empresa: { razaoSocial: string; cnpj?: string | null; logoDataUrl?: string | null };
  kpis?: RelatorioKpi[];
  secoes: RelatorioSecao[];
  rodape?: string | null;
};

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 40;
const LARGURA_UTIL = A4.largura - MARGEM * 2;

const CINZA_ZEBRA = "#f4f5f7";
const CINZA_LINHA = "#d7dbe0";
const COR_TEXTO = "#101828";
const COR_MUTED = "#5c6470";

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

function formatCnpj(cnpj?: string | null): string {
  const d = (cnpj ?? "").replace(/\D+/g, "");
  if (d.length !== 14) return cnpj ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export async function gerarRelatorioPdf(input: RelatorioPdfInput): Promise<Buffer> {
  const doc = new PDFKit({ size: "A4", margin: MARGEM, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const fim = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const logo = logoBuffer(input.empresa.logoDataUrl);

  const cabecalho = () => {
    const topo = MARGEM;
    let xTexto = MARGEM;
    if (logo) {
      try {
        doc.image(logo, MARGEM, topo, { fit: [110, 44] });
        xTexto = MARGEM + 122;
      } catch {
        /* logo inválido: segue sem imagem */
      }
    }
    doc.fillColor(COR_TEXTO).font("Helvetica-Bold").fontSize(11).text(input.empresa.razaoSocial, xTexto, topo + 4, { width: A4.largura - xTexto - MARGEM });
    if (input.empresa.cnpj) {
      doc.font("Helvetica").fontSize(8).fillColor(COR_MUTED).text(`CNPJ ${formatCnpj(input.empresa.cnpj)}`, xTexto, doc.y + 1);
    }
    doc.moveTo(MARGEM, topo + 52).lineTo(A4.largura - MARGEM, topo + 52).lineWidth(0.8).strokeColor(CINZA_LINHA).stroke();
    doc.fillColor(COR_TEXTO).font("Helvetica-Bold").fontSize(15).text(input.titulo, MARGEM, topo + 62);
    if (input.subtitulo) {
      doc.font("Helvetica").fontSize(9).fillColor(COR_MUTED).text(input.subtitulo, MARGEM, doc.y + 2);
    }
    doc.y += 8;
  };

  const garantirEspaco = (altura: number) => {
    if (doc.y + altura > A4.altura - MARGEM - 24) {
      doc.addPage();
      doc.y = MARGEM;
    }
  };

  cabecalho();

  // ── KPIs (faixa de cartões) ──
  if (input.kpis?.length) {
    const porLinha = Math.min(4, input.kpis.length);
    const larguraKpi = (LARGURA_UTIL - (porLinha - 1) * 8) / porLinha;
    let i = 0;
    while (i < input.kpis.length) {
      garantirEspaco(46);
      const linhaY = doc.y;
      for (let c = 0; c < porLinha && i < input.kpis.length; c++, i++) {
        const kpi = input.kpis[i];
        const x = MARGEM + c * (larguraKpi + 8);
        doc.roundedRect(x, linhaY, larguraKpi, 40, 4).lineWidth(0.8).strokeColor(CINZA_LINHA).stroke();
        doc.font("Helvetica").fontSize(7.5).fillColor(COR_MUTED).text(kpi.label.toUpperCase(), x + 8, linhaY + 7, { width: larguraKpi - 16, ellipsis: true, height: 10 });
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COR_TEXTO).text(kpi.valor, x + 8, linhaY + 19, { width: larguraKpi - 16, ellipsis: true, height: 16 });
      }
      doc.y = linhaY + 48;
    }
  }

  // ── Seções ──
  for (const secao of input.secoes) {
    if (secao.titulo) {
      garantirEspaco(30);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COR_TEXTO).text(secao.titulo, MARGEM, doc.y + 8);
      doc.y += 4;
    }
    if (secao.texto) {
      garantirEspaco(24);
      doc.font("Helvetica").fontSize(9).fillColor(COR_MUTED).text(secao.texto, MARGEM, doc.y + 2, { width: LARGURA_UTIL });
      doc.y += 4;
    }
    const tabela = secao.tabela;
    if (!tabela || !tabela.colunas.length) continue;

    const somaPesos = tabela.colunas.reduce((s, c) => s + (c.peso ?? 1), 0);
    const larguras = tabela.colunas.map((c) => ((c.peso ?? 1) / somaPesos) * LARGURA_UTIL);

    const desenharCelulas = (valores: string[], y: number, opts: { bold?: boolean; fundo?: string | null }) => {
      const alturaLinha = 16;
      if (opts.fundo) {
        doc.rect(MARGEM, y, LARGURA_UTIL, alturaLinha).fillColor(opts.fundo).fill();
      }
      let x = MARGEM;
      doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(COR_TEXTO);
      valores.forEach((valor, idx) => {
        const col = tabela.colunas[idx];
        doc.text(valor ?? "", x + 4, y + 4, {
          width: larguras[idx] - 8,
          align: col?.align ?? "left",
          lineBreak: false,
          ellipsis: true
        });
        x += larguras[idx];
      });
      return alturaLinha;
    };

    const desenharCabecalhoTabela = () => {
      garantirEspaco(20);
      const y = doc.y;
      doc.rect(MARGEM, y, LARGURA_UTIL, 16).fillColor("#e9edf2").fill();
      let x = MARGEM;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COR_TEXTO);
      tabela.colunas.forEach((col, idx) => {
        doc.text(col.label, x + 4, y + 4, { width: larguras[idx] - 8, align: col.align ?? "left", lineBreak: false, ellipsis: true });
        x += larguras[idx];
      });
      doc.y = y + 16;
    };

    desenharCabecalhoTabela();
    tabela.linhas.forEach((linha, idx) => {
      if (doc.y + 16 > A4.altura - MARGEM - 24) {
        doc.addPage();
        doc.y = MARGEM;
        desenharCabecalhoTabela();
      }
      const altura = desenharCelulas(linha, doc.y, { fundo: idx % 2 === 1 ? CINZA_ZEBRA : null });
      doc.y += altura;
    });
    if (tabela.total) {
      garantirEspaco(18);
      doc.moveTo(MARGEM, doc.y).lineTo(A4.largura - MARGEM, doc.y).lineWidth(0.8).strokeColor(CINZA_LINHA).stroke();
      const altura = desenharCelulas(tabela.total, doc.y + 1, { bold: true, fundo: null });
      doc.y += altura + 2;
    }
    if (!tabela.linhas.length) {
      garantirEspaco(18);
      doc.font("Helvetica").fontSize(8.5).fillColor(COR_MUTED).text("Sem registros no período.", MARGEM, doc.y + 4);
      doc.y += 16;
    }
    doc.y += 6;
  }

  // ── Rodapé em todas as páginas (data de geração + numeração) ──
  const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    const y = A4.altura - MARGEM + 14;
    doc.font("Helvetica").fontSize(7.5).fillColor(COR_MUTED);
    doc.text(`${input.rodape ?? "Relatório gerencial"} · gerado em ${geradoEm}`, MARGEM, y, { lineBreak: false });
    doc.text(`Página ${p - range.start + 1} de ${range.count}`, A4.largura - MARGEM - 100, y, { width: 100, align: "right", lineBreak: false });
  }

  doc.end();
  return fim;
}
