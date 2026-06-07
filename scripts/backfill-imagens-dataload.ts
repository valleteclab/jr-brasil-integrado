/**
 * Preenche a imagem dos produtos que têm GTIN mas ainda não têm imagem, consultando o banco
 * Dataload por código de barras. Idempotente (pula quem já tem imagem). Rodar:
 *
 *   npx tsx scripts/backfill-imagens-dataload.ts
 */
import { prisma } from "../src/lib/db/prisma";
import { consultarImagemDataload } from "../src/domains/products/application/dataload-service";

async function main() {
  const produtos = await prisma.produto.findMany({
    where: { gtin: { not: null }, imagens: { none: {} } },
    select: { id: true, tenantId: true, empresaId: true, gtin: true, nome: true }
  });
  console.log(`${produtos.length} produto(s) com GTIN e sem imagem.`);

  let vinculadas = 0;
  let semImagem = 0;
  for (const p of produtos) {
    const gtin = (p.gtin ?? "").replace(/\D/g, "");
    if (gtin.length < 8) continue;
    try {
      const res = await consultarImagemDataload(gtin);
      if (res.encontrado && res.url) {
        await prisma.produtoImagem.create({
          data: { tenantId: p.tenantId, empresaId: p.empresaId, produtoId: p.id, url: res.url, ordem: 0 }
        });
        vinculadas += 1;
      } else {
        semImagem += 1;
      }
    } catch (e) {
      console.warn(`  ${gtin} (${p.nome}): ${e instanceof Error ? e.message : e}`);
    }
    if ((vinculadas + semImagem) % 100 === 0) console.log(`  ...${vinculadas} vinculadas / ${semImagem} sem imagem`);
  }

  console.log(`Concluído: ${vinculadas} imagens vinculadas, ${semImagem} sem imagem no Dataload.`);
}

main()
  .catch((err) => {
    console.error("Erro no backfill:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
