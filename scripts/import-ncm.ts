/**
 * Importa a Tabela NCM Vigente (Siscomex) para o model `Ncm`, usado para ancorar as sugestões
 * de NCM da IA. Idempotente (upsert). Rodar uma vez (e após atualizações da tabela):
 *
 *   npx tsx scripts/import-ncm.ts
 *
 * Fonte oficial (JSON público): Portal Único Siscomex — Nomenclatura.
 */
import { prisma } from "../src/lib/db/prisma";
import { limparDescricaoNcm, normalizarBusca } from "../src/domains/fiscal/ncm-service";

const FONTE = "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";

type Nomenclatura = { Codigo?: string; codigo?: string; Descricao?: string; descricao?: string };

function onlyDigits(v: string) {
  return (v ?? "").replace(/\D/g, "");
}

async function baixarTabela(): Promise<Nomenclatura[]> {
  const res = await fetch(FONTE, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Falha ao baixar a tabela NCM (HTTP ${res.status}).`);
  const data = (await res.json()) as { Nomenclaturas?: Nomenclatura[]; nomenclaturas?: Nomenclatura[] } | Nomenclatura[];
  const lista = Array.isArray(data) ? data : data.Nomenclaturas ?? data.nomenclaturas ?? [];
  if (!lista.length) throw new Error("A tabela NCM veio vazia.");
  return lista;
}

async function main() {
  console.log("Baixando tabela NCM do Siscomex…");
  const lista = await baixarTabela();

  // Mantém apenas códigos de 8 dígitos (folhas da NCM, que vão na NF-e). Limpa o HTML da
  // descrição e gera a versão normalizada (sem acento) para busca por palavra-chave.
  const registros = lista
    .map((n) => {
      const codigo = onlyDigits(n.Codigo ?? n.codigo ?? "");
      const bruta = (n.Descricao ?? n.descricao ?? "").trim();
      return { codigo, descricao: limparDescricaoNcm(bruta), descricaoBusca: normalizarBusca(bruta) };
    })
    .filter((n) => n.codigo.length === 8 && n.descricao);

  console.log(`Encontrados ${registros.length} NCMs de 8 dígitos. Recriando tabela…`);

  // Refresh completo: a limpeza/normalização da descrição mudou, então recria do zero.
  await prisma.ncm.deleteMany({});

  let gravados = 0;
  const lote = 1000;
  for (let i = 0; i < registros.length; i += lote) {
    const slice = registros.slice(i, i + lote);
    const res = await prisma.ncm.createMany({ data: slice, skipDuplicates: true });
    gravados += res.count;
    console.log(`  lote ${i / lote + 1}: +${res.count} (acumulado ${gravados})`);
  }

  const total = await prisma.ncm.count();
  console.log(`Concluído: ${gravados} inseridos. Total na tabela: ${total}.`);
}

main()
  .catch((err) => {
    console.error("Erro ao importar NCM:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
