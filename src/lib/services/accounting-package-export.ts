import type { AccountingPackageReport } from "./reports";

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

export function accountingPackageCsv(report: AccountingPackageReport): string {
  const resumo = [report.resumo];
  const checklist = report.checklist.map((item) => ({ status: item.status, item: item.item, detalhe: item.detalhe }));
  return [
    `Pacote contabil;${csvCell(report.competencia)};${csvCell(`${report.inicio} a ${report.fim}`)}`,
    csvSection("Resumo", resumo),
    csvSection("Checklist", checklist),
    csvSection("Fiscal - Saidas", report.fiscalSaidas),
    csvSection("Fiscal - Entradas", report.fiscalEntradas),
    csvSection("Financeiro - Contas a receber", report.financeiro.receber),
    csvSection("Financeiro - Contas a pagar", report.financeiro.pagar),
    csvSection("Estoque - Movimentos", report.estoque)
  ].join("\n\n");
}

export function accountingPackageHtml(report: AccountingPackageReport): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pacote contábil - ${escapeHtml(report.competencia)}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:32px}h1{margin-bottom:4px}h2{margin-top:28px;border-bottom:1px solid #d7dde8;padding-bottom:6px}.muted{color:#667085}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}.kpi{border:1px solid #d7dde8;border-radius:10px;padding:12px;background:#f8fafc}.kpi strong{display:block;font-size:18px;margin-top:6px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}th,td{border:1px solid #d7dde8;padding:6px;text-align:left;vertical-align:top}th{background:#eef2f7}.ok{color:#047857}.warn{color:#b45309}@media print{body{margin:12mm}.no-print{display:none}.kpis{grid-template-columns:repeat(2,1fr)}}</style></head><body><button class="no-print" onclick="window.print()">Imprimir / salvar PDF</button><h1>Pacote contábil mensal</h1><p class="muted">Competência: ${escapeHtml(report.competencia)} · Período: ${escapeHtml(report.inicio)} a ${escapeHtml(report.fim)}</p><div class="kpis"><div class="kpi">Notas de saída<strong>${report.resumo.notasSaida}</strong></div><div class="kpi">Valor saídas<strong>${escapeHtml(report.resumo.valorSaidas)}</strong></div><div class="kpi">Entradas fiscais<strong>${report.resumo.entradasFiscais}</strong></div><div class="kpi">Valor entradas<strong>${escapeHtml(report.resumo.valorEntradas)}</strong></div><div class="kpi">Contas a receber<strong>${escapeHtml(report.resumo.contasReceber)}</strong></div><div class="kpi">Contas a pagar<strong>${escapeHtml(report.resumo.contasPagar)}</strong></div><div class="kpi">Estoque a custo<strong>${escapeHtml(report.resumo.valorEstoque)}</strong></div><div class="kpi">Pendências<strong>${report.resumo.pendencias}</strong></div></div>${htmlTable("Checklist", report.checklist)}${htmlTable("Fiscal - Saídas", report.fiscalSaidas)}${htmlTable("Fiscal - Entradas", report.fiscalEntradas)}${htmlTable("Financeiro - Contas a receber", report.financeiro.receber)}${htmlTable("Financeiro - Contas a pagar", report.financeiro.pagar)}${htmlTable("Estoque - Movimentos", report.estoque)}</body></html>`;
}
