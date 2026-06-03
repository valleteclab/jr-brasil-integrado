import { NBS_LIST, CLASS_TRIB_LIST, LC116_CORRELACAO, type NbsItem, type ClassTribItem } from "./nbs-data";

export type { NbsItem, ClassTribItem };
export { NBS_LIST, CLASS_TRIB_LIST };

const NBS_BY_CODE = new Map(NBS_LIST.map((n) => [n.code, n]));
const CT_BY_CODE = new Map(CLASS_TRIB_LIST.map((c) => [c.code, c]));

/** Normaliza um código LC 116 ("1.07" ou "1.7" ou "01.07") para o formato da tabela ("01.07"). */
function normalizeLc116(code: string | null | undefined): string {
  const raw = (code ?? "").trim();
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (!m) return raw;
  return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}`;
}

/** Apenas dígitos do NBS (a tabela usa "1.1502.10.00"; nós guardamos "115021000"). */
export function onlyNbsDigits(code: string | null | undefined): string {
  return (code ?? "").replace(/\D/g, "");
}

export function isValidNbs(code: string | null | undefined): boolean {
  const d = onlyNbsDigits(code);
  return d.length === 9 && NBS_BY_CODE.has(d);
}

export function nbsDescription(code: string | null | undefined): string | null {
  return NBS_BY_CODE.get(onlyNbsDigits(code))?.description ?? null;
}

export function classTribNome(code: string | null | undefined): string | null {
  return CT_BY_CODE.get((code ?? "").trim())?.nome ?? null;
}

export type Lc116Sugestao = {
  /** NBS sugeridos para o item (objetos com code + description). */
  nbs: NbsItem[];
  /** cClassTrib aplicáveis ao item. */
  classTrib: ClassTribItem[];
  /** NBS sugerido como padrão (o primeiro da correlação), quando houver. */
  nbsPadrao: string | null;
  /** cClassTrib sugerido como padrão (situação tributada integral 000001, se aplicável). */
  classTribPadrao: string | null;
  indOp: string | null;
  localIncidencia: string | null;
};

/**
 * Sugestão de NBS + cClassTrib a partir do código LC 116 escolhido, usando a tabela
 * oficial de correlação (Anexo VIII RTC IBS/CBS). Retorna null quando o item não está na tabela.
 */
export function sugerirPorLc116(lc116?: string | null): Lc116Sugestao | null {
  const corr = LC116_CORRELACAO[normalizeLc116(lc116)];
  if (!corr) return null;

  const nbs = corr.nbs.map((c) => NBS_BY_CODE.get(c)).filter((n): n is NbsItem => Boolean(n));
  const classTrib = corr.classTrib.map((c) => CT_BY_CODE.get(c)).filter((c): c is ClassTribItem => Boolean(c));
  // Padrão de classificação: "000001" (tributada integral) quando disponível; senão o primeiro.
  const classTribPadrao = corr.classTrib.includes("000001") ? "000001" : (corr.classTrib[0] ?? null);

  return {
    nbs,
    classTrib,
    nbsPadrao: corr.nbs[0] ?? null,
    classTribPadrao,
    indOp: corr.indOp,
    localIncidencia: corr.localIncidencia
  };
}
