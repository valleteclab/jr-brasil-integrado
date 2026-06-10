/**
 * Utilitários de escrita do arquivo EFD ICMS/IPI (SPED Fiscal).
 *
 * Regras do leiaute (Guia Prático EFD ICMS IPI):
 * - Campos separados por "|", linha iniciando e terminando com "|".
 * - Números com vírgula decimal e sem separador de milhar.
 * - Datas no formato ddmmaaaa.
 * - Linhas terminadas em CRLF.
 */

/** Sanitiza texto para um campo do SPED: remove o separador "|" e quebras de linha. */
export function campoTexto(valor: string | null | undefined): string {
  if (valor == null) return "";
  return String(valor).replace(/[|\r\n]/g, " ").trim();
}

/** Mantém apenas dígitos (e letras, para CNPJ alfanumérico) — usado em CNPJ/CPF/CEP/fone. */
export function campoDocumento(valor: string | null | undefined): string {
  if (!valor) return "";
  return String(valor).replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/** Valor monetário/numérico com vírgula decimal (padrão 2 casas). Vazio quando nulo. */
export function campoNumero(valor: number | null | undefined, casas = 2): string {
  if (valor == null || Number.isNaN(valor)) return "";
  return valor.toFixed(casas).replace(".", ",");
}

/** Quantidades: até `casas` decimais, removendo zeros à direita (PVA aceita ambos). */
export function campoQuantidade(valor: number | null | undefined, casas = 5): string {
  if (valor == null || Number.isNaN(valor)) return "";
  const fixo = valor.toFixed(casas);
  const limpo = fixo.replace(/0+$/, "").replace(/\.$/, "");
  return (limpo || "0").replace(".", ",");
}

/** Data no formato ddmmaaaa exigido pelo leiaute. */
export function campoData(data: Date | null | undefined): string {
  if (!data) return "";
  const dd = String(data.getDate()).padStart(2, "0");
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${data.getFullYear()}`;
}

/** Monta uma linha de registro: |REG|campo1|campo2|...| */
export function linha(campos: Array<string>): string {
  return `|${campos.join("|")}|`;
}

/**
 * Acumulador de linhas do arquivo com contagem por registro — usada para fechar os blocos
 * (x990), montar o bloco 9 (9900 por registro) e o totalizador final (9999).
 */
export class SpedBuilder {
  private linhas: string[] = [];
  private contagem = new Map<string, number>();

  add(campos: Array<string>): void {
    const reg = campos[0];
    this.linhas.push(linha(campos));
    this.contagem.set(reg, (this.contagem.get(reg) ?? 0) + 1);
  }

  /** Total de linhas adicionadas até aqui. */
  get total(): number {
    return this.linhas.length;
  }

  /** Quantidade de linhas de um registro específico. */
  count(reg: string): number {
    return this.contagem.get(reg) ?? 0;
  }

  /** Registros distintos presentes (ordenados), para o bloco 9. */
  registros(): Array<{ registro: string; quantidade: number }> {
    return Array.from(this.contagem.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([registro, quantidade]) => ({ registro, quantidade }));
  }

  /** Conteúdo final com CRLF (inclusive após a última linha, como exige o leiaute). */
  conteudo(): string {
    return this.linhas.join("\r\n") + "\r\n";
  }
}
