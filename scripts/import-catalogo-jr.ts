/**
 * CLI para importar o catálogo da JR Brasil. Thin wrapper sobre o núcleo compartilhado
 * (src/domains/products/application/catalogo-jr-import.ts) — o mesmo usado pelo endpoint
 * /api/cron/import-catalogo. Roda onde houver acesso ao banco (DATABASE_URL).
 *
 * Uso:
 *   npx tsx scripts/import-catalogo-jr.ts [--arquivo="docs/CATALOGO JR ATUALIZADO.csv"]
 *          [--empresa=<id>] [--limit=N] [--dry] [--relatorio]
 */
import fs from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { analisarCatalogo, importarCatalogo } from "../src/domains/products/application/catalogo-jr-import";

const arg = (k: string, d = "") => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const has = (k: string) => process.argv.includes(`--${k}`);

const ARQUIVO = arg("arquivo", "docs/CATALOGO JR ATUALIZADO.csv");
const EMPRESA_ID = arg("empresa");
const LIMIT = Number(arg("limit", "0")) || 0;
const DRY = has("dry");
const RELATORIO = has("relatorio");

async function main() {
  if (!fs.existsSync(ARQUIVO)) throw new Error(`Arquivo não encontrado: ${ARQUIVO}`);
  const csv = fs.readFileSync(ARQUIVO, "utf8");

  if (DRY || RELATORIO) {
    const r = analisarCatalogo(csv, { limit: LIMIT });
    console.log(`Arquivo: ${ARQUIVO} · linhas: ${r.total} · válidas: ${r.validos}`);
    console.log(`\n── Famílias (${Object.keys(r.porFamilia).length}) ──`);
    for (const [f, n] of Object.entries(r.porFamilia)) console.log(`  ${String(n).padStart(5)}  ${f}`);
    console.log(`\n── NCM ──`);
    for (const [f, n] of Object.entries(r.porNcm)) console.log(`  ${String(n).padStart(5)}  ${f}`);
    console.log(`\n── A revisar: ${r.revisarCount} ──`);
    r.revisar.slice(0, 40).forEach((x) => console.log(`  ${x.sku}  ${x.nome} — ${x.motivo}`));
    if (r.revisar.length > 40) console.log(`  …+${r.revisar.length - 40}`);
    console.log("\n── Amostra ──");
    r.amostra.forEach((x) => console.log(`  ${x.sku} | ${x.nome} | ${x.familia} → ${x.ncm ?? "—"} | marca=${x.marca ?? "-"}`));
    if (DRY) { console.log("\n(dry-run — nada gravado)"); return; }
  }

  if (!EMPRESA_ID) throw new Error("Informe --empresa=<id> para gravar (ou use --dry).");
  const empresa = await prisma.empresa.findUnique({ where: { id: EMPRESA_ID }, select: { id: true, tenantId: true, razaoSocial: true } });
  if (!empresa) throw new Error(`Empresa ${EMPRESA_ID} não encontrada.`);
  const scope = { tenantId: empresa.tenantId, empresaId: empresa.id };
  console.log(`\nEmpresa: ${empresa.razaoSocial} (${empresa.id})`);
  const res = await importarCatalogo(scope, csv, { limit: LIMIT });
  console.log(`Resumo: criados=${res.criados} (monofásico=${res.monofasico}) · enriquecidos=${res.enriquecidos} · pulados=${res.pulados} · erros=${res.erros}`);
  res.errosDetalhe.forEach((e) => console.log(`  ❌ ${e.sku}: ${e.erro}`));
}

main().catch((e) => { console.error("ERRO:", e?.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
