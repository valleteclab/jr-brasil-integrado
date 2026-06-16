/**
 * Corrige preço de venda/custo dos produtos importados a partir do arquivo (por código).
 * precoVenda = maior precoVenda das linhas do código; precoCusto = maior precoCusto.
 * Atualiza só quando difere. Diagnóstico: reporta quantos estavam divergentes.
 *
 * Uso (PRODUÇÃO): npx tsx scripts/corrigir-precos.ts [--empresa=<id>] [--dry]
 */
import fs from "node:fs";
import { prisma } from "../src/lib/db/prisma";

type Item = { codigo: string; precoVenda: number; precoCusto: number };
const arg = (k: string, d = "") => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : d; };
const DRY = process.argv.includes("--dry");
const EMPRESA_ID = arg("empresa", "cmqfut5v2000fhk8ghiobb9lo");

async function main() {
  const empresa = await prisma.empresa.findUnique({ where: { id: EMPRESA_ID }, select: { id: true, tenantId: true, razaoSocial: true } });
  if (!empresa) throw new Error("Empresa não encontrada.");
  console.log(`Empresa: ${empresa.razaoSocial}${DRY ? " · DRY" : ""}`);

  const itens: Item[] = JSON.parse(fs.readFileSync("scripts/seu-gama-inventario.json", "utf8"));
  const precoPorCod = new Map<string, { venda: number; custo: number }>();
  for (const it of itens) {
    const cur = precoPorCod.get(it.codigo) ?? { venda: 0, custo: 0 };
    precoPorCod.set(it.codigo, { venda: Math.max(cur.venda, it.precoVenda || 0), custo: Math.max(cur.custo, it.precoCusto || 0) });
  }

  let conferidos = 0, divergentes = 0, corrigidos = 0;
  const exemplos: string[] = [];
  for (const [codigo, p] of precoPorCod) {
    const prod = await prisma.produto.findUnique({
      where: { tenantId_empresaId_sku: { tenantId: empresa.tenantId, empresaId: empresa.id, sku: codigo.toUpperCase() } },
      select: { id: true, precoVenda: true, precoCusto: true, nome: true }
    });
    if (!prod) continue;
    conferidos++;
    const vendaDb = Number(prod.precoVenda), custoDb = Number(prod.precoCusto);
    const difVenda = Math.abs(vendaDb - p.venda) > 0.001;
    const difCusto = Math.abs(custoDb - p.custo) > 0.001;
    if (!difVenda && !difCusto) continue;
    divergentes++;
    if (exemplos.length < 12) exemplos.push(`  ${codigo} ${prod.nome}: venda ${vendaDb}->${p.venda}${difCusto ? ` custo ${custoDb}->${p.custo}` : ""}`);
    if (!DRY) {
      await prisma.produto.update({ where: { id: prod.id }, data: { precoVenda: p.venda, ultimoCusto: p.custo, precoCusto: p.custo, custoMedio: p.custo } });
      corrigidos++;
    }
  }
  console.log(`Conferidos: ${conferidos} · divergentes: ${divergentes} · corrigidos: ${corrigidos}`);
  if (exemplos.length) { console.log("Exemplos divergentes:"); exemplos.forEach((e) => console.log(e)); }
}

main().catch((e) => { console.error("ERRO:", e?.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
