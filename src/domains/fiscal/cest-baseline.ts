import { prisma } from "@/lib/db/prisma";

/**
 * CEST (Código Especificador da Substituição Tributária): tabela GLOBAL com a descrição e os
 * NCMs aos quais cada CEST se aplica. Populada de dataset público (CONFAZ via br-data), serve
 * ao seletor do produto e ao grounding da sugestão de CEST por NCM (inclusive na IA).
 */
const CEST_FONTE = "https://raw.githubusercontent.com/idfsistemas/br-data/master/data/cest/data.json";

type CestRaw = { cest?: string; descricao?: string; ncms?: string[] };

function onlyDigits(v: string | undefined | null) {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * NCMs de um item CEST. Na tabela oficial os NCMs são POSIÇÕES/PREFIXOS de 2 a 8 dígitos
 * (ex.: CEST 01.075.00 → "8708" inteiro), e alguns registros da fonte trazem VÁRIOS NCMs numa
 * string só ("45049000 68129910"). Divide por separador não-numérico e aceita 2–8 dígitos —
 * o filtro antigo (só 8 dígitos) descartava os prefixos e deixava a maioria dos CEST sem NCM.
 */
function parseNcms(brutos: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const raw of brutos ?? []) {
    // Divide por qualquer coisa que não seja dígito nem ponto (espaço, NBSP, vírgula...).
    for (const token of String(raw).split(/[^\d.]+/)) {
      const dig = onlyDigits(token);
      if (dig.length >= 2 && dig.length <= 8) out.add(dig);
    }
  }
  return [...out];
}

/** Baixa e popula a tabela Cest (idempotente; recria para refletir atualizações). */
export async function applyCest(): Promise<{ total: number; comNcm: number }> {
  const res = await fetch(CEST_FONTE, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Falha ao baixar CEST (HTTP ${res.status}).`);
  const lista = (await res.json()) as CestRaw[];

  const registros = lista
    .map((c) => ({
      codigo: onlyDigits(c.cest),
      descricao: (c.descricao ?? "").trim(),
      ncms: parseNcms(c.ncms)
    }))
    .filter((c) => c.codigo.length === 7 && c.descricao);

  await prisma.cest.deleteMany({});
  const lote = 500;
  for (let i = 0; i < registros.length; i += lote) {
    await prisma.cest.createMany({ data: registros.slice(i, i + lote), skipDuplicates: true });
  }
  const total = await prisma.cest.count();
  const comNcm = await prisma.cest.count({ where: { NOT: { ncms: { isEmpty: true } } } });
  return { total, comNcm };
}

/**
 * Prefixos de um NCM para casar com a tabela CEST (que guarda posições de 2–8 dígitos):
 * "87089990" → ["87", "870", ..., "87089990"]. Use com `ncms: { hasSome: prefixos }`.
 */
export function ncmPrefixos(ncm: string | null | undefined): string[] {
  const dig = onlyDigits(ncm);
  const out: string[] = [];
  for (let i = 2; i <= Math.min(8, dig.length); i++) out.push(dig.slice(0, i));
  return out;
}
