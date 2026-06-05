import type { ApuracaoImpostosReport } from "./reports";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function csvSection(title: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `${title}\nSem dados\n`;
  const headers = Object.keys(rows[0]);
  return [
    title,
    headers.map(csvCell).join(";"),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(";"))
  ].join("\n");
}

function htmlTable(title: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `<section><h2>${escapeHtml(title)}</h2><p>Sem dados.</p></section>`;
  const headers = Object.keys(rows[0]);
  return `<section><h2>${escapeHtml(title)}</h2><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(row[h])}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
}

// Linhas da apuração sem os campos numéricos auxiliares (só o que interessa ao contador).
function linhasParaExport(report: ApuracaoImpostosReport): Record<string, unknown>[] {
  return report.linhas.map((l) => ({
    tributo: l.tributo,
    debito: l.debito,
    credito: l.credito,
    saldo: l.saldo,
    situacao: l.situacao
  }));
}

export function apuracaoCsv(report: ApuracaoImpostosReport): string {
  const resumo = [{
    regime: report.regime,
    creditos: report.totais.creditos,
    debitos: report.totais.debitos,
    saldo: report.totais.saldo,
    situacao: report.totais.aPagar ? "A pagar" : "Saldo credor"
  }];
  const retencoes = report.retencoes.map((r) => ({ tributo: r.tributo, valor: r.valor }));
  return [
    `Apuracao de impostos;${csvCell(report.competencia)};${csvCell(`${report.inicio} a ${report.fim}`)}`,
    report.avisoRegime ? `Aviso;${csvCell(report.avisoRegime)}` : "",
    csvSection("Resumo", resumo),
    csvSection("Apuracao por tributo", linhasParaExport(report)),
    csvSection("Retencoes na fonte (saidas)", retencoes),
    csvSection("Creditos detalhados (entradas)", report.entradasDetalhe),
    csvSection("Debitos detalhados (saidas)", report.saidasDetalhe),
    csvSection("Retencoes por nota", report.retencoesDetalhe)
  ].filter(Boolean).join("\n\n");
}

export function apuracaoHtml(report: ApuracaoImpostosReport): string {
  const aviso = report.avisoRegime
    ? `<p class="warn" style="border:1px solid #f0c36d;background:#fff8e6;padding:10px;border-radius:8px">${escapeHtml(report.avisoRegime)}</p>`
    : "";
  const saldoLabel = report.totais.aPagar ? "Total a pagar" : "Saldo credor";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Apuração de impostos - ${escapeHtml(report.competencia)}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:32px}h1{margin-bottom:4px}h2{margin-top:28px;border-bottom:1px solid #d7dde8;padding-bottom:6px}.muted{color:#667085}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.kpi{border:1px solid #d7dde8;border-radius:10px;padding:12px;background:#f8fafc}.kpi strong{display:block;font-size:18px;margin-top:6px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}th,td{border:1px solid #d7dde8;padding:6px;text-align:left;vertical-align:top}th{background:#eef2f7}@media print{body{margin:12mm}.no-print{display:none}}</style></head><body><button class="no-print" onclick="window.print()">Imprimir / salvar PDF</button><h1>Apuração de impostos</h1><p class="muted">Competência: ${escapeHtml(report.competencia)} · Período: ${escapeHtml(report.inicio)} a ${escapeHtml(report.fim)} · Regime: ${escapeHtml(report.regime)}</p>${aviso}<div class="kpis"><div class="kpi">Crédito (entradas)<strong>${escapeHtml(report.totais.creditos)}</strong></div><div class="kpi">Débito (saídas)<strong>${escapeHtml(report.totais.debitos)}</strong></div><div class="kpi">${saldoLabel}<strong>${escapeHtml(report.totais.saldo)}</strong></div><div class="kpi">Retido na fonte<strong>${escapeHtml(report.totalRetido)}</strong></div></div>${htmlTable("Apuração por tributo", linhasParaExport(report))}${htmlTable("Retenções na fonte (saídas)", report.retencoes.map((r) => ({ tributo: r.tributo, valor: r.valor })))}${htmlTable("Créditos detalhados (entradas)", report.entradasDetalhe)}${htmlTable("Débitos detalhados (saídas)", report.saidasDetalhe)}${htmlTable("Retenções por nota", report.retencoesDetalhe)}</body></html>`;
}
