import { NBS_LIST, CLASS_TRIB_LIST, LC116_CORRELACAO, type NbsItem, type ClassTribItem } from "./nbs-data";

export type { NbsItem, ClassTribItem };
export { NBS_LIST, CLASS_TRIB_LIST };

const NBS_BY_CODE = new Map(NBS_LIST.map((n) => [n.code, n]));
const CT_BY_CODE = new Map(CLASS_TRIB_LIST.map((c) => [c.code, c]));

/**
 * Normaliza o código de serviço para o formato "II.SS" (subitem LC 116), que é a chave da correlação NBS.
 * Aceita LC 116 ("1.07"/"1.7"/"01.07") e também o cTribNac de 6 dígitos novo ("010701" → "01.07"),
 * já que a correlação NBS é por subitem (os 4 primeiros dígitos: item+subitem).
 */
function normalizeLc116(code: string | null | undefined): string {
  const raw = (code ?? "").trim();
  const d = raw.replace(/\D/g, "");
  if (d.length === 6 && !raw.includes(".")) return `${d.slice(0, 2)}.${d.slice(2, 4)}`;
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

/**
 * CST do IBS/CBS a partir do cClassTrib. Na tabela oficial de Classificacao Tributaria cada
 * cClassTrib (6 digitos) pertence a UM CST, e o CST sao os 3 primeiros digitos do codigo:
 * 000001 -> CST 000 (tributacao integral), 200046 -> CST 200 (reducao de aliquota), 400001 -> 400.
 * Mandar o par errado faz a SEFIN/SEFAZ rejeitar com "E0959 cClassTrib nao pertence ao grupo CST
 * indicado" (ocorreu na NFS-e 99/100 da Valleteclab: item 07.02 -> cClassTrib 200046 com CST 000).
 */
export function cstDoClassTrib(cClassTrib: string | null | undefined): string | null {
  const d = (cClassTrib ?? "").replace(/\D/g, "");
  return d.length === 6 ? d.slice(0, 3) : null;
}

/**
 * CST coerente para o par (CST informado, cClassTrib): o cClassTrib manda, porque e ele que
 * define o grupo. Um CST informado so prevalece quando nao ha cClassTrib de onde derivar.
 */
export function cstIbsCbsCoerente(cstInformado: string | null | undefined, cClassTrib: string | null | undefined): string {
  const derivado = cstDoClassTrib(cClassTrib);
  if (derivado) return derivado;
  const informado = (cstInformado ?? "").replace(/\D/g, "");
  return informado ? informado.padStart(3, "0").slice(-3) : "000";
}
