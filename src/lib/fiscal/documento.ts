/**
 * Validação e normalização de documentos (CNPJ e CPF), com suporte ao CNPJ ALFANUMÉRICO
 * da Receita Federal (produção a partir de 06/07/2026).
 *
 * Novo CNPJ: 14 posições no formato [A-Z0-9]{12}[0-9]{2} — as 12 primeiras (raiz + ordem)
 * aceitam letras e números; os 2 dígitos verificadores continuam numéricos. O DV é calculado
 * por módulo 11 convertendo cada caractere pelo seu código ASCII menos 48 (assim '0'..'9' valem
 * 0..9 e 'A'..'Z' valem 17..42). Esse cálculo devolve o MESMO DV para os CNPJs numéricos atuais,
 * então o validador aceita os dois formatos sem quebrar o que já existe.
 *
 * Use estas funções em vez de regex numérico / replace(/\D/g) ao tratar documento de
 * fornecedor, cliente, emitente e destinatário.
 */

const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Apenas dígitos (para CPF, CEP, IE e demais campos estritamente numéricos). */
export function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Normaliza um documento: remove máscara/pontuação e espaços, coloca em maiúsculas e PRESERVA
 * as letras (necessário para o CNPJ alfanumérico). Não use onlyDigits em documento — perde letras.
 */
export function normalizeDocumento(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Valor do caractere no cálculo do DV: dígito = ele mesmo; letra A–Z = ASCII − 48 (A=17…Z=42). */
function valorCaractere(ch: string): number {
  return ch.charCodeAt(0) - 48;
}

function calcularDv(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    soma += valorCaractere(base[i]) * pesos[i];
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Valida CNPJ numérico OU alfanumérico (formato + dígitos verificadores por ASCII−48). */
export function isValidCnpj(value: string | null | undefined): boolean {
  const c = normalizeDocumento(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(c)) return false;
  // Rejeita sequências repetidas (ex.: 00000000000000) — inválidas embora "bem formadas".
  if (/^(.)\1{13}$/.test(c)) return false;
  const dv1 = calcularDv(c.slice(0, 12), PESOS_DV1);
  const dv2 = calcularDv(c.slice(0, 13), PESOS_DV2);
  return c[12] === String(dv1) && c[13] === String(dv2);
}

/** Valida CPF (numérico, 11 dígitos, com dígitos verificadores). */
export function isValidCpf(value: string | null | undefined): boolean {
  const c = onlyDigits(value);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (slice: number) => {
    let soma = 0;
    for (let i = 0; i < slice; i++) soma += Number(c[i]) * (slice + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/** Indica se o documento normalizado tem 14 posições (CNPJ) — numérico ou alfanumérico. */
export function isCnpj(value: string | null | undefined): boolean {
  return normalizeDocumento(value).length === 14;
}

/** Indica que o CNPJ contém letra (novo formato alfanumérico). */
export function isCnpjAlfanumerico(value: string | null | undefined): boolean {
  const c = normalizeDocumento(value);
  return c.length === 14 && /[A-Z]/.test(c);
}

/** Valida documento aceitando CPF (11) ou CNPJ (14, alfanumérico ou não). */
export function isValidDocumento(value: string | null | undefined): boolean {
  const c = normalizeDocumento(value);
  if (c.length === 14) return isValidCnpj(c);
  if (c.length === 11) return isValidCpf(c);
  return false;
}

/** Aplica a máscara visual conforme o tamanho (CNPJ 00.000.000/0000-00, CPF 000.000.000-00). */
export function formatDocumento(value: string | null | undefined): string {
  const c = normalizeDocumento(value);
  if (c.length === 14) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  if (c.length === 11) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  return value ?? "";
}
