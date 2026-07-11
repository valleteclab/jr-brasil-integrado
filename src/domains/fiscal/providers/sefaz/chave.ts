/**
 * Chave de acesso da NF-e (44 caracteres) e dígito verificador (módulo 11).
 *
 * Layout: cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9) + tpEmis(1) + cNF(8) + cDV(1).
 * O cNF (código numérico aleatório) é derivado de forma DETERMINÍSTICA de (CNPJ+mod+serie+nNF):
 * assim um reenvio da MESMA nota gera a MESMA chave — a SEFAZ rejeita a duplicidade (539) em vez de
 * autorizar duas notas. cNF != nNF é exigido pela SEFAZ (rejeição 539/NT), o que é garantido aqui.
 */

import { normalizeDocumento } from "@/lib/fiscal/documento";

const onlyDigits = (s: string | number | null | undefined) => String(s ?? "").replace(/\D/g, "");
const padL = (s: string | number, n: number) => onlyDigits(s).padStart(n, "0").slice(-n);

/** Normaliza chave de DFe preservando as letras maiúsculas introduzidas pelo CNPJ alfanumérico. */
export function normalizeDfeKey(value: string | null | undefined): string {
  return String(value ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Dígito verificador da chave (módulo 11, pesos 2..9 da direita p/ esquerda; resto 0/1 → DV 0). */
export function calcDV(chave43: string): string {
  const d = normalizeDfeKey(chave43);
  if (d.length !== 43) throw new Error(`Chave para DV deve ter 43 caracteres (recebi ${d.length}).`);
  let soma = 0;
  let peso = 2;
  for (let i = d.length - 1; i >= 0; i--) {
    // NT Conjunta DFe 2025.001: cada caractere vale ASCII - 48 (0=0, A=17 ... Z=42).
    soma += (d.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return String(dv >= 10 ? 0 : dv);
}

/** cNF determinístico (8 dígitos) a partir dos campos que identificam a nota. Nunca igual ao nNF. */
export function deterministicCNF(cnpj: string, mod: string, serie: string, nNF: string): string {
  const seed = `${normalizeDocumento(cnpj)}|${onlyDigits(mod)}|${onlyDigits(serie)}|${onlyDigits(nNF)}`;
  // Hash FNV-1a 32 bits → 8 dígitos decimais. Estável entre execuções (idempotência de reenvio).
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let cNF = padL(h % 100000000, 8);
  // cNF não pode ser igual ao nNF (rejeição da SEFAZ): se colidir, perturba de forma estável.
  if (Number(cNF) === Number(onlyDigits(nNF))) cNF = padL((Number(cNF) + 1) % 100000000, 8);
  return cNF;
}

export type ChaveParts = {
  cUF: string;     // 2
  aamm: string;    // 4 (AAMM da dhEmi)
  cnpj: string;    // 14
  mod: string;     // 2 (55)
  serie: string;   // 3
  nNF: string;     // 9
  tpEmis: string;  // 1
  cNF: string;     // 8
};

/** Monta a chave de 44 caracteres (43 + DV) a partir das partes. */
export function montarChave(p: ChaveParts): { chave: string; cDV: string; cNF: string } {
  const cnpj = normalizeDocumento(p.cnpj);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)) {
    throw new Error(`CNPJ inválido para chave de acesso: esperado 14 caracteres no padrão alfanumérico.`);
  }
  const base43 =
    padL(p.cUF, 2) + padL(p.aamm, 4) + cnpj + padL(p.mod, 2) +
    padL(p.serie, 3) + padL(p.nNF, 9) + padL(p.tpEmis, 1) + padL(p.cNF, 8);
  if (base43.length !== 43) throw new Error(`Chave base inválida (${base43.length} caracteres): ${base43}`);
  const cDV = calcDV(base43);
  return { chave: base43 + cDV, cDV, cNF: padL(p.cNF, 8) };
}

/** AAMM (ano-mês com 2+2 dígitos) a partir de uma dhEmi no formato ISO (YYYY-MM-...). */
export function aammFromDhEmi(dhEmi: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(dhEmi);
  if (!m) throw new Error(`dhEmi inválida para AAMM: ${dhEmi}`);
  return m[1].slice(2) + m[2];
}
