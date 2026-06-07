/**
 * Popula as categorias-base de produto (ProdutoCategoria) para todas as empresas.
 * Idempotente. Rodar uma vez (e após novas empresas):
 *
 *   npx tsx scripts/seed-categorias.ts
 */
import { prisma } from "../src/lib/db/prisma";
import { applyDefaultCategories } from "../src/domains/products/application/category-baseline";

async function main() {
  const empresas = await prisma.empresa.findMany({ select: { id: true, tenantId: true, nomeFantasia: true } });
  if (!empresas.length) {
    console.log("Nenhuma empresa encontrada.");
    return;
  }
  for (const emp of empresas) {
    const res = await applyDefaultCategories({ tenantId: emp.tenantId, empresaId: emp.id });
    console.log(`${emp.nomeFantasia ?? emp.id}: +${res.criadas} novas (total ${res.total}).`);
  }
}

main()
  .catch((err) => {
    console.error("Erro ao popular categorias:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
