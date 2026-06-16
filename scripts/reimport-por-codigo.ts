/**
 * CORREÇÃO do import: reimporta o inventário UNIFICANDO por CÓDIGO do arquivo.
 *  - 1 produto por código (SKU = código do arquivo), descrição base (sem sufixo "- NN").
 *  - Soma os saldos das linhas do mesmo código (negativo total -> 0).
 *  - Fiscal (NCM/CEST/categoria) do mapa pré-classificado, validado contra a tabela Ncm.
 *  - Antes de criar, APAGA os produtos antigos do import por linha (SKU "SG-%") e seus dependentes.
 *
 * Uso (PRODUÇÃO): npx tsx scripts/reimport-por-codigo.ts [--empresa=<id>] [--dry] [--no-purge]
 */
import fs from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { createProduct } from "../src/domains/products/application/product-use-cases";
import { findNcm } from "../src/domains/fiscal/ncm-service";

type Item = { seq: number; codigo: string; descricao: string; unidade: string; qtd: number; precoVenda: number; precoCusto: number };
type Fiscal = { ncm: string | null; cest: string | null; categoria: string | null };

const arg = (k: string, d = "") => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=").slice(1).join("=") : d; };
const has = (k: string) => process.argv.includes(`--${k}`);
const EMPRESA_ID = arg("empresa", "cmqfut5v2000fhk8ghiobb9lo");
const DRY = has("dry");
const PURGE = !has("no-purge");

const base = (s: string) => s.replace(/\s*-\s*\d+\s*$/, "").replace(/\s+/g, " ").trim();
const grupoKey = (s: string) => base(s).toUpperCase();

async function main() {
  const empresa = await prisma.empresa.findUnique({ where: { id: EMPRESA_ID }, select: { id: true, tenantId: true, razaoSocial: true } });
  if (!empresa) throw new Error(`Empresa ${EMPRESA_ID} não encontrada.`);
  const scope = { tenantId: empresa.tenantId, empresaId: empresa.id };
  console.log(`Empresa: ${empresa.razaoSocial}${DRY ? " · DRY-RUN" : ""}`);

  const itens: Item[] = JSON.parse(fs.readFileSync("scripts/seu-gama-inventario.json", "utf8"));

  // Agrupa por código.
  const byCod = new Map<string, Item[]>();
  for (const it of itens) { const a = byCod.get(it.codigo) ?? []; a.push(it); byCod.set(it.codigo, a); }
  console.log(`Linhas ${itens.length} -> produtos por código ${byCod.size}`);

  // Mapa fiscal (grupo base -> {ncm,cest,categoria}) com validação + fallback por subposição.
  const rawFis = JSON.parse(fs.readFileSync("scripts/seu-gama-fiscal.json", "utf8")) as Record<string, Fiscal>;
  const ncmsDistintos = [...new Set(Object.values(rawFis).map((f) => f.ncm).filter(Boolean) as string[])];
  const remap = new Map<string, string | null>();
  for (const n of ncmsDistintos) {
    const exato = await findNcm(n);
    if (exato?.codigo) { remap.set(n, exato.codigo); continue; }
    const folha = await prisma.ncm.findFirst({ where: { codigo: { startsWith: n.slice(0, 6) } }, orderBy: { codigo: "asc" }, select: { codigo: true } });
    remap.set(n, folha?.codigo ?? null);
  }
  const fiscalDe = (nomeBase: string): Fiscal => {
    const f = rawFis[grupoKey(nomeBase)]; if (!f) return { ncm: null, cest: null, categoria: null };
    return { ncm: f.ncm ? (remap.get(f.ncm) ?? null) : null, cest: f.cest ?? null, categoria: f.categoria ?? null };
  };

  // Purga dos produtos do import antigo (1 por linha, SKU "SG-%") e dependentes.
  if (PURGE && !DRY) {
    const antigos = await prisma.produto.findMany({ where: { tenantId: scope.tenantId, empresaId: scope.empresaId, sku: { startsWith: "SG-" } }, select: { id: true } });
    const ids = antigos.map((p) => p.id);
    console.log(`Apagando ${ids.length} produtos antigos (SG-*)...`);
    for (let i = 0; i < ids.length; i += 500) {
      const lote = ids.slice(i, i + 500);
      const w = { produtoId: { in: lote } };
      await prisma.estoqueMovimento.deleteMany({ where: w });
      await prisma.estoqueReserva.deleteMany({ where: w }).catch(() => {});
      await prisma.estoqueSaldo.deleteMany({ where: w });
      await prisma.produtoFiscal.deleteMany({ where: w }).catch(() => {});
      await prisma.produtoImagem.deleteMany({ where: w }).catch(() => {});
      await prisma.produtoAplicacao.deleteMany({ where: w }).catch(() => {});
      await prisma.produtoFornecedor.deleteMany({ where: w }).catch(() => {});
      await prisma.produto.deleteMany({ where: { id: { in: lote } } });
    }
    console.log("Purga concluída.");
  }

  let criados = 0, pulados = 0, erros = 0;
  for (const [codigo, rows] of byCod) {
    const sku = codigo.toUpperCase();
    const r0 = rows[0];
    const nomeBase = base(r0.descricao);             // forma usada na busca fiscal (= chave do mapa)
    const nome = nomeBase.replace(/\s*-\s*$/, "").trim() || r0.descricao; // exibição (sem "-" pendurado)
    const saldo = Math.max(0, rows.reduce((a, r) => a + r.qtd, 0));
    const precoVenda = Math.max(...rows.map((r) => r.precoVenda), 0);
    const precoCusto = Math.max(...rows.map((r) => r.precoCusto), 0);
    const fis = fiscalDe(nomeBase);

    const existe = await prisma.produto.findUnique({ where: { tenantId_empresaId_sku: { tenantId: scope.tenantId, empresaId: scope.empresaId, sku } }, select: { id: true } });
    if (existe) { pulados++; continue; }
    if (DRY) { criados++; if (criados <= 8) console.log(`  [dry] ${sku} ${nome} | ${r0.unidade} | saldo=${saldo} venda=${precoVenda} | NCM=${fis.ncm}`); continue; }
    try {
      await createProduct(scope, {
        sku, name: nome, originalCode: codigo, type: "Produto", unit: r0.unidade,
        category: fis.categoria || "Importado", priceValue: precoVenda, costValue: precoCusto,
        availableStock: saldo, minimumStock: 0,
        ncm: fis.ncm || undefined, cest: fis.cest || undefined, origin: "0", cfopInState: "5102", cfopOutState: "6102"
      } as any);
      criados++;
      if (criados % 500 === 0) console.log(`  ...${criados} criados`);
    } catch (e) { erros++; if (erros <= 15) console.log(`  ❌ ${sku} "${nome}": ${(e as Error)?.message}`); }
  }
  console.log(`\nResumo: criados=${criados} · pulados=${pulados} · erros=${erros}`);
}

main().catch((e) => { console.error("ERRO:", e?.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
