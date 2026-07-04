import PDFKit from "pdfkit";

/**
 * PDF da ORDEM DE SERVIÇO (A4) com a identidade do cliente: cabeçalho com logo + emitente,
 * dados do cliente/veículo, problema/diagnóstico, serviços (mão de obra), peças, execução
 * (apontamentos), totais e campo de ASSINATURA do cliente. Fontes built-in (sem TTF).
 */

export type OrdemServicoPdfInput = {
  numero: string;
  status: string;
  criadoEm: string;
  previsaoEm: string | null;
  empresa: { razaoSocial: string; cnpj?: string | null; logoDataUrl?: string | null };
  cliente: { nome: string; documento?: string | null; telefone?: string | null };
  equipamento: string;
  placa: string | null;
  km: string | null;
  tecnicoResponsavel: string | null;
  problemaRelatado: string | null;
  diagnostico: string | null;
  observacoes: string | null;
  servicos: Array<{ descricao: string; tecnico: string | null; horas: number; valorHora: number; total: number }>;
  pecas: Array<{ sku: string; nome: string; quantidade: number; precoUnitario: number; total: number }>;
  apontamentos: Array<{ tecnico: string; descricao: string; horas: number | null; data: string }>;
  totalServicos: number;
  totalPecas: number;
  desconto: number;
  total: number;
};

const A4 = { largura: 595.28, altura: 841.89 };
const M = 40;
const UTIL = A4.largura - M * 2;
const LINHA = "#d7dbe0";
const MUTED = "#5c6470";
const INK = "#101828";
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function logoBuffer(dataUrl?: string | null): Buffer | undefined {
  if (!dataUrl) return undefined;
  const m = /^data:image\/(?:png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return undefined;
  try { return Buffer.from(m[1], "base64"); } catch { return undefined; }
}

function fmtCnpj(cnpj?: string | null): string {
  const d = (cnpj ?? "").replace(/\D+/g, "");
  if (d.length !== 14) return cnpj ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export async function gerarOrdemServicoPdf(input: OrdemServicoPdfInput): Promise<Buffer> {
  const doc = new PDFKit({ size: "A4", margin: M, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // ── Cabeçalho ──
  const logo = logoBuffer(input.empresa.logoDataUrl);
  let xTexto = M;
  if (logo) {
    try { doc.image(logo, M, M, { fit: [100, 40] }); xTexto = M + 112; } catch { /* logo inválido */ }
  }
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(input.empresa.razaoSocial, xTexto, M + 2, { width: A4.largura - xTexto - M });
  if (input.empresa.cnpj) doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`CNPJ ${fmtCnpj(input.empresa.cnpj)}`, xTexto, doc.y + 1);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text(`Ordem de Serviço ${input.numero}`, A4.largura - M - 240, M + 2, { width: 240, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(
    `Abertura: ${new Date(input.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` +
    (input.previsaoEm ? `  ·  Previsão: ${new Date(input.previsaoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""),
    A4.largura - M - 240, doc.y + 1, { width: 240, align: "right" }
  );
  doc.moveTo(M, M + 52).lineTo(A4.largura - M, M + 52).lineWidth(0.8).strokeColor(LINHA).stroke();
  doc.y = M + 60;

  // ── Cliente + veículo ──
  const box = (titulo: string, linhas: Array<[string, string]>, x: number, largura: number) => {
    const y0 = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(titulo, x, y0);
    doc.font("Helvetica").fontSize(9).fillColor(INK);
    let y = y0 + 14;
    for (const [k, v] of linhas) {
      if (!v) continue;
      doc.fillColor(MUTED).text(`${k}: `, x, y, { continued: true, width: largura }).fillColor(INK).text(v);
      y = doc.y + 2;
    }
    return y;
  };
  const meioX = M + UTIL / 2 + 8;
  const yA = box("CLIENTE", [["Nome", input.cliente.nome], ["Documento", input.cliente.documento ?? ""], ["Telefone", input.cliente.telefone ?? ""]], M, UTIL / 2 - 8);
  const yB = box("EQUIPAMENTO / VEÍCULO", [["Descrição", input.equipamento], ["Placa/Série", input.placa ?? ""], ["KM/Horímetro", input.km ?? ""], ["Técnico resp.", input.tecnicoResponsavel ?? ""]], meioX, UTIL / 2 - 8);
  doc.y = Math.max(yA, yB) + 6;

  const paragrafo = (titulo: string, texto: string | null) => {
    if (!texto) return;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(titulo, M, doc.y + 4);
    doc.font("Helvetica").fontSize(9).fillColor(INK).text(texto, M, doc.y + 1, { width: UTIL });
  };
  paragrafo("Problema relatado", input.problemaRelatado);
  paragrafo("Diagnóstico", input.diagnostico);

  // ── Tabelas ──
  const tabela = (titulo: string, colunas: Array<{ label: string; peso: number; align?: "left" | "right" }>, linhas: string[][], total?: string[]) => {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(titulo, M, doc.y + 10);
    const somaPeso = colunas.reduce((s, c) => s + c.peso, 0);
    const larguras = colunas.map((c) => (c.peso / somaPeso) * UTIL);
    const head = () => {
      const y = doc.y + 2;
      doc.rect(M, y, UTIL, 15).fillColor("#e9edf2").fill();
      let x = M;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
      colunas.forEach((c, i) => { doc.text(c.label, x + 4, y + 4, { width: larguras[i] - 8, align: c.align ?? "left", lineBreak: false, ellipsis: true }); x += larguras[i]; });
      doc.y = y + 15;
    };
    head();
    linhas.forEach((linha, idx) => {
      if (doc.y + 15 > A4.altura - M - 60) { doc.addPage(); doc.y = M; head(); }
      const y = doc.y;
      if (idx % 2 === 1) doc.rect(M, y, UTIL, 15).fillColor("#f4f5f7").fill();
      let x = M;
      doc.font("Helvetica").fontSize(8).fillColor(INK);
      linha.forEach((v, i) => { doc.text(v ?? "", x + 4, y + 4, { width: larguras[i] - 8, align: colunas[i].align ?? "left", lineBreak: false, ellipsis: true }); x += larguras[i]; });
      doc.y = y + 15;
    });
    if (!linhas.length) { doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("—", M, doc.y + 3); doc.y += 14; }
    if (total) {
      const y = doc.y;
      let x = M;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(INK);
      total.forEach((v, i) => { doc.text(v ?? "", x + 4, y + 3, { width: larguras[i] - 8, align: colunas[i].align ?? "left", lineBreak: false }); x += larguras[i]; });
      doc.y = y + 16;
    }
  };

  tabela(
    "Serviços (mão de obra)",
    [{ label: "Descrição", peso: 3 }, { label: "Técnico", peso: 1.6 }, { label: "Horas", peso: 0.8, align: "right" }, { label: "Valor/h", peso: 1, align: "right" }, { label: "Total", peso: 1, align: "right" }],
    input.servicos.map((s) => [s.descricao, s.tecnico ?? "—", `${s.horas}h`, brl(s.valorHora), brl(s.total)]),
    ["Total serviços", "", "", "", brl(input.totalServicos)]
  );
  tabela(
    "Peças",
    [{ label: "Cód.", peso: 1 }, { label: "Produto", peso: 3.4 }, { label: "Qtd.", peso: 0.8, align: "right" }, { label: "Unit.", peso: 1, align: "right" }, { label: "Total", peso: 1, align: "right" }],
    input.pecas.map((p) => [p.sku, p.nome, String(p.quantidade), brl(p.precoUnitario), brl(p.total)]),
    ["", "Total peças", "", "", brl(input.totalPecas)]
  );

  // ── Execução (apontamentos) ──
  if (input.apontamentos.length) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Execução — o que foi feito", M, doc.y + 10);
    for (const a of input.apontamentos) {
      if (doc.y + 26 > A4.altura - M - 60) { doc.addPage(); doc.y = M; }
      doc.font("Helvetica-Bold").fontSize(8).fillColor(INK).text(
        `${a.tecnico} · ${new Date(a.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}${a.horas ? ` · ${a.horas}h` : ""}`, M, doc.y + 4
      );
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(a.descricao, M, doc.y + 1, { width: UTIL });
    }
  }

  // ── Totais + assinatura ──
  if (doc.y + 90 > A4.altura - M) { doc.addPage(); doc.y = M; }
  doc.y += 12;
  const yTot = doc.y;
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  const linhaTot = (label: string, valor: string, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10);
    doc.text(label, A4.largura - M - 240, doc.y, { width: 150, align: "right", continued: true }).text(`  ${valor}`, { align: "right" });
    doc.y += bold ? 4 : 2;
  };
  doc.y = yTot;
  linhaTot("Serviços:", brl(input.totalServicos));
  linhaTot("Peças:", brl(input.totalPecas));
  if (input.desconto > 0) linhaTot("Desconto:", `- ${brl(input.desconto)}`);
  doc.moveTo(A4.largura - M - 240, doc.y + 2).lineTo(A4.largura - M, doc.y + 2).lineWidth(0.8).strokeColor(LINHA).stroke();
  doc.y += 6;
  linhaTot("TOTAL:", brl(input.total), true);

  // Assinatura do cliente (à esquerda, na mesma faixa dos totais).
  const yAssin = Math.max(doc.y, yTot + 70);
  doc.moveTo(M, yAssin).lineTo(M + 240, yAssin).lineWidth(0.8).strokeColor(INK).stroke();
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Assinatura do cliente (autorização/retirada)", M, yAssin + 4, { width: 240 });

  // Rodapé.
  const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(`OS ${input.numero} · gerado em ${geradoEm}`, M, A4.altura - M + 14, { lineBreak: false });
  }

  doc.end();
  return done;
}
