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

/** Baixa e popula a tabela Cest (idempotente; recria para refletir atualizações). */
export async function applyCest(): Promise<{ total: number }> {
  const res = await fetch(CEST_FONTE, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Falha ao baixar CEST (HTTP ${res.status}).`);
  const lista = (await res.json()) as CestRaw[];

  const registros = lista
    .map((c) => ({
      codigo: onlyDigits(c.cest),
      descricao: (c.descricao ?? "").trim(),
      ncms: Array.from(new Set((c.ncms ?? []).map((n) => onlyDigits(n)).filter((n) => n.length === 8)))
    }))
    .filter((c) => c.codigo.length === 7 && c.descricao);

  await prisma.cest.deleteMany({});
  const lote = 500;
  for (let i = 0; i < registros.length; i += lote) {
    await prisma.cest.createMany({ data: registros.slice(i, i + lote), skipDuplicates: true });
  }
  const total = await prisma.cest.count();
  return { total };
}
