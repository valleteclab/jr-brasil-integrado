/**
 * Popula as tabelas de referência GLOBAIS (compartilhadas por todas as empresas):
 * categorias-padrão e unidades de medida. Idempotente. Rodar uma vez:
 *
 *   npx tsx scripts/seed-referencias.ts
 *
 * Também limpa categorias por-empresa SEM produtos cujo slug coincide com uma categoria-padrão
 * (desfaz duplicações antigas em que a lista padrão era copiada para dentro de cada empresa).
 */
import { prisma } from "../src/lib/db/prisma";
import { applyDefaultCategoriasPadrao, applyDefaultUnidades } from "../src/domains/products/application/category-baseline";
import { applyFiscalCodes } from "../src/domains/fiscal/fiscal-codes-baseline";
import { applyCest } from "../src/domains/fiscal/cest-baseline";
import { applyMunicipios } from "../src/domains/fiscal/municipio-baseline";

async function main() {
  const cat = await applyDefaultCategoriasPadrao();
  console.log(`Categorias-padrão (global): ${cat.total}.`);

  const uni = await applyDefaultUnidades();
  console.log(`Unidades de medida (global): ${uni.total}.`);

  const fiscais = await applyFiscalCodes();
  console.log("Códigos fiscais (global):", fiscais);

  const cest = await applyCest();
  console.log(`CEST (global): ${cest.total}.`);

  const mun = await applyMunicipios();
  console.log(`Municípios IBGE (global): ${mun.total}.`);

  // Limpeza: remove ProdutoCategoria (por empresa) que duplicam a lista padrão e não têm produtos.
  const slugsPadrao = (await prisma.categoriaPadrao.findMany({ select: { slug: true } })).map((c) => c.slug);
  const removidas = await prisma.produtoCategoria.deleteMany({
    where: { slug: { in: slugsPadrao }, produtos: { none: {} } }
  });
  console.log(`Categorias por-empresa duplicadas e vazias removidas: ${removidas.count}.`);
}

main()
  .catch((err) => {
    console.error("Erro ao popular referências:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
