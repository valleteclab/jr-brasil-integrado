import { prisma } from "@/lib/db/prisma";

/**
 * Municípios do IBGE: tabela GLOBAL (código de 7 dígitos + nome + UF), populada da API pública do
 * IBGE. Valida/preenche o código de município na NF-e e alimenta seletores de endereço.
 */
const IBGE_FONTE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado";

type MunicipioRaw = { "municipio-id"?: number | string; "municipio-nome"?: string; "UF-sigla"?: string };

/** Baixa e popula a tabela Municipio (idempotente; recria para refletir atualizações). */
export async function applyMunicipios(): Promise<{ total: number }> {
  const res = await fetch(IBGE_FONTE, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Falha ao baixar municípios do IBGE (HTTP ${res.status}).`);
  const lista = (await res.json()) as MunicipioRaw[];

  const registros = lista
    .map((m) => ({
      codigo: String(m["municipio-id"] ?? "").replace(/\D/g, ""),
      nome: (m["municipio-nome"] ?? "").trim(),
      uf: (m["UF-sigla"] ?? "").trim().toUpperCase()
    }))
    .filter((m) => m.codigo.length === 7 && m.nome && m.uf.length === 2);

  await prisma.municipio.deleteMany({});
  const lote = 1000;
  for (let i = 0; i < registros.length; i += lote) {
    await prisma.municipio.createMany({ data: registros.slice(i, i + lote), skipDuplicates: true });
  }
  const total = await prisma.municipio.count();
  return { total };
}
