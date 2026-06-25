/**
 * Código de Tributação Nacional (cTribNac) da NFS-e Nacional — tabela oficial de 6 dígitos
 * (item+subitem+desdobro), mais granular que a LC 116 "crua" (X.XX). É o código que vai no XML
 * da NFS-e padrão nacional. Mantemos compatibilidade com o formato LC 116 legado (X.XX) já gravado.
 */
import { CTRIB_NAC_LIST, type CTribNacItem } from "./codigo-tributacao-nacional-data";
import { isValidLc116 } from "./lc116";

export { CTRIB_NAC_LIST };
export type { CTribNacItem };

const CTRIB_NAC_SET = new Set(CTRIB_NAC_LIST.map((i) => i.code));
const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** É um Código de Tributação Nacional (cTribNac) de 6 dígitos válido. */
export function isValidCTribNac(code: string | null | undefined): boolean {
  const c = onlyDigits(code);
  return c.length === 6 && CTRIB_NAC_SET.has(c);
}

/** Aceita o cTribNac novo (6 dígitos) OU o LC 116 legado (X.XX). Use na validação da emissão. */
export function isCodigoServicoValido(code: string | null | undefined): boolean {
  return isValidCTribNac(code) || isValidLc116(code);
}

/** Descrição oficial do cTribNac (6 dígitos). */
export function cTribNacDescription(code: string | null | undefined): string | null {
  const c = onlyDigits(code);
  if (c.length !== 6) return null;
  return CTRIB_NAC_LIST.find((i) => i.code === c)?.descricao ?? null;
}

/**
 * cTribNac de 6 dígitos para o XML da NFS-e:
 *  - já-6-dígitos (novo): passa direto;
 *  - LC 116 legado (X.XX ou X.XX.YY): deriva item(2)+subitem(2)+desdobro(2) (desdobro do 3º grupo, senão "01").
 */
export function cTribNacFromCodigo(code: string | null | undefined): string {
  const c = onlyDigits(code);
  if (c.length === 6) return c;
  const parts = (code ?? "").split(".");
  if (parts.length < 2) return "010101";
  const item = onlyDigits(parts[0]).padStart(2, "0").slice(-2);
  const sub = onlyDigits(parts[1]).padStart(2, "0").slice(0, 2);
  const desdobro = onlyDigits(parts[2] ?? "").padStart(2, "0").slice(0, 2) || "01";
  return `${item}${sub}${desdobro}`;
}

/** Opções {code, description} para os seletores de serviço da NFS-e (rótulo = descrição oficial). */
export const CODIGO_SERVICO_OPTIONS = CTRIB_NAC_LIST.map((i) => ({ code: i.code, description: i.descricao }));
