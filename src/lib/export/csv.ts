/**
 * Exportação de dados tabulares para CSV (client-side). Abre no Excel/Sheets (separador ";" e BOM
 * UTF-8, padrão pt-BR) sem depender de biblioteca. Uso:
 *   baixarCsv("contas-a-pagar", [{ Descrição: "...", Valor: 1234.5 }], { Valor: "moeda" });
 */

export type FormatoColuna = "texto" | "moeda" | "data";

/** Formata um valor para a célula do CSV conforme o tipo (moeda/data pt-BR ou texto). */
function formatarCelula(valor: unknown, formato: FormatoColuna): string {
  if (valor == null) return "";
  if (formato === "moeda") {
    const n = Number(valor);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(valor);
  }
  if (formato === "data") {
    const d = valor instanceof Date ? valor : new Date(String(valor));
    return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString("pt-BR");
  }
  return String(valor);
}

/** Escapa uma célula para CSV (aspas quando há separador, aspas ou quebra de linha). */
function escapar(celula: string): string {
  return /[";\n\r]/.test(celula) ? `"${celula.replace(/"/g, '""')}"` : celula;
}

/**
 * Gera e baixa um CSV a partir de linhas (objetos). As colunas são as chaves da primeira linha
 * (ou `colunas` explícito). `formatos` mapeia coluna → moeda/data (padrão texto).
 */
export function baixarCsv(
  nomeArquivo: string,
  linhas: Array<Record<string, unknown>>,
  formatos: Record<string, FormatoColuna> = {},
  colunas?: string[]
): void {
  if (typeof window === "undefined") return;
  const cols = colunas ?? (linhas[0] ? Object.keys(linhas[0]) : []);
  const cabecalho = cols.map((c) => escapar(c)).join(";");
  const corpo = linhas
    .map((linha) => cols.map((c) => escapar(formatarCelula(linha[c], formatos[c] ?? "texto"))).join(";"))
    .join("\r\n");
  // BOM (﻿) faz o Excel abrir em UTF-8 e reconhecer acentos.
  const conteudo = `﻿${cabecalho}\r\n${corpo}`;
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dataHoje = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${nomeArquivo}-${dataHoje}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
