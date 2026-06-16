/**
 * Importa um inventário (JSON gerado do PDF) como produtos de uma empresa, com classificação
 * fiscal por IA (NCM/CEST/categoria) agrupada por produto. CST/origem saem das regras tributárias
 * nacionais por NCM/regime; aqui gravamos NCM/CEST/CFOP/origem no produto.
 *
 * Uso (rodar em PRODUÇÃO, onde há DB + chave de IA do tenant):
 *   npx tsx scripts/import-inventario.ts --empresa=<id> [--arquivo=scripts/seu-gama-inventario.json]
 *                                        [--limit=N] [--dry] [--no-ai]
 *
 * Idempotente: cada linha vira o SKU "SG-<seq>"; se já existir, pula (re-rodar é seguro).
 */
import fs from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { createProduct } from "../src/domains/products/application/product-use-cases";
import { callOpenRouter } from "../src/domains/ai/openrouter-service";
import { findNcm, searchNcm } from "../src/domains/fiscal/ncm-service";

type Item = { seq: number; codigo: string; descricao: string; unidade: string; qtd: number; precoVenda: number; precoCusto: number };
type Fiscal = { ncm: string | null; cest: string | null; categoria: string | null };

const arg = (k: string, d = "") => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const has = (k: string) => process.argv.includes(`--${k}`);

const EMPRESA_ID = arg("empresa", "cmqfut5v2000fhk8ghiobb9lo"); // Seu Gama Materiais de Construção
const ARQUIVO = arg("arquivo", "scripts/seu-gama-inventario.json");
// Mapa fiscal pré-classificado (grupo -> {ncm,cest,categoria}); se existir, usa em vez da IA ao vivo.
const FISCAL_FILE = arg("fiscal", "scripts/seu-gama-fiscal.json");
const LIMIT = Number(arg("limit", "0")) || 0;
const DRY = has("dry");
const USE_AI = !has("no-ai") && !fs.existsSync(FISCAL_FILE);

// Nome-base do grupo: remove o sufixo " - NN" (numeração de calçado/ruído do relatório) e normaliza.
const grupoKey = (desc: string) => desc.replace(/\s*-\s*\d+\s*$/, "").replace(/\s+/g, " ").trim().toUpperCase();

function jsonArray(content: string): any[] {
  const i = content.indexOf("["); const j = content.lastIndexOf("]");
  if (i < 0 || j < i) return [];
  try { return JSON.parse(content.slice(i, j + 1)); } catch { return []; }
}

async function classificarGrupos(scope: { tenantId: string; empresaId: string }, grupos: string[]): Promise<Map<string, Fiscal>> {
  const out = new Map<string, Fiscal>();
  if (!USE_AI) { for (const g of grupos) out.set(g, { ncm: null, cest: null, categoria: null }); return out; }
  const LOTE = 35;
  for (let i = 0; i < grupos.length; i += LOTE) {
    const lote = grupos.slice(i, i + LOTE);
    const comCand = await Promise.all(lote.map(async (g, idx) => ({
      id: String(i + idx),
      descricao: g,
      candidatos: await searchNcm(g, 8)
    })));
    try {
      const content = await callOpenRouter(
        scope,
        [
          { role: "system", content: "Você é um classificador fiscal brasileiro. Escolha o NCM (8 dígitos) mais adequado a cada produto a partir dos candidatos do PRÓPRIO item. Responda só JSON." },
          { role: "user", content: JSON.stringify({
              instrucoes: "Para cada item retorne {id, ncm (8 dígitos dos candidatos do item, ou null), cest (ou null), categoria (curta)}.",
              itens: comCand,
              formato: [{ id: "0", ncm: "73089090", cest: null, categoria: "Ferragens" }]
            }) }
        ],
        { maxTokens: 1800, temperature: 0 }
      );
      const arr = jsonArray(content);
      const byId = new Map(arr.map((s: any) => [String(s.id), s]));
      for (let k = 0; k < lote.length; k++) {
        const s = byId.get(String(i + k));
        const ncm = await findNcm(typeof s?.ncm === "string" ? s.ncm : null);
        out.set(lote[k], {
          ncm: ncm?.codigo ?? null,
          cest: (typeof s?.cest === "string" ? s.cest.replace(/\D/g, "") : "") || null,
          categoria: typeof s?.categoria === "string" && s.categoria.trim() ? s.categoria.trim() : null
        });
      }
    } catch (e) {
      for (const g of lote) out.set(g, { ncm: null, cest: null, categoria: null });
      console.log(`  ⚠️ IA falhou no lote ${i}-${i + lote.length}: ${(e as Error)?.message}`);
    }
    console.log(`  IA: ${Math.min(i + LOTE, grupos.length)}/${grupos.length} grupos classificados`);
  }
  return out;
}

async function main() {
  const empresa = await prisma.empresa.findUnique({ where: { id: EMPRESA_ID }, select: { id: true, tenantId: true, razaoSocial: true } });
  if (!empresa) throw new Error(`Empresa ${EMPRESA_ID} não encontrada.`);
  const scope = { tenantId: empresa.tenantId, empresaId: empresa.id };
  console.log(`Empresa: ${empresa.razaoSocial} (${empresa.id})`);

  let itens: Item[] = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
  if (LIMIT > 0) itens = itens.slice(0, LIMIT);
  console.log(`Itens a importar: ${itens.length}${USE_AI ? " · com IA fiscal" : " · SEM IA"}${DRY ? " · DRY-RUN" : ""}`);

  // Classificação fiscal por grupo (distintos).
  const grupos = [...new Set(itens.map((i) => grupoKey(i.descricao)))];
  console.log(`Grupos fiscais distintos: ${grupos.length}`);
  let fiscalPorGrupo: Map<string, Fiscal>;
  if (fs.existsSync(FISCAL_FILE)) {
    // Mapa pré-classificado (subagentes). Valida cada NCM distinto contra a tabela oficial; NCM
    // inexistente vira null (melhor não gravar NCM do que gravar um inválido que rejeita a NF-e).
    const raw = JSON.parse(fs.readFileSync(FISCAL_FILE, "utf8")) as Record<string, Fiscal>;
    const ncmsDistintos = [...new Set(Object.values(raw).map((f) => f.ncm).filter(Boolean) as string[])];
    // Resolve cada NCM: exato na tabela; senão, uma folha válida da MESMA subposição (6 dígitos);
    // senão null. Evita gravar NCM inexistente (rejeitado pela SEFAZ) sem perder a classificação.
    const remap = new Map<string, string | null>();
    let exatos = 0, porPrefixo = 0, nulos = 0;
    for (const n of ncmsDistintos) {
      const exato = await findNcm(n);
      if (exato?.codigo) { remap.set(n, exato.codigo); exatos++; continue; }
      const folha = await prisma.ncm.findFirst({ where: { codigo: { startsWith: n.slice(0, 6) } }, orderBy: { codigo: "asc" }, select: { codigo: true } });
      if (folha?.codigo) { remap.set(n, folha.codigo); porPrefixo++; } else { remap.set(n, null); nulos++; }
    }
    console.log(`Mapa fiscal: ${Object.keys(raw).length} grupos · NCM distintos ${ncmsDistintos.length} · exatos ${exatos} · por subposição ${porPrefixo} · sem NCM ${nulos}`);
    fiscalPorGrupo = new Map(Object.entries(raw).map(([g, f]) => [g, { ncm: f.ncm ? (remap.get(f.ncm) ?? null) : null, cest: f.cest ?? null, categoria: f.categoria ?? null }]));
  } else {
    fiscalPorGrupo = DRY && !USE_AI ? new Map<string, Fiscal>() : await classificarGrupos(scope, grupos);
  }

  let criados = 0, pulados = 0, enriquecidos = 0, erros = 0;
  for (const item of itens) {
    const sku = `SG-${item.seq}`;
    const fis = fiscalPorGrupo.get(grupoKey(item.descricao)) ?? { ncm: null, cest: null, categoria: null };
    const existe = await prisma.produto.findUnique({ where: { tenantId_empresaId_sku: { tenantId: scope.tenantId, empresaId: scope.empresaId, sku } }, select: { id: true, ncm: true } });
    if (existe) {
      // Já criado: enriquece NCM/CEST se faltava e a IA agora trouxe (re-rodar após configurar a IA).
      if (!DRY && !existe.ncm && fis.ncm) {
        await prisma.produto.update({ where: { id: existe.id }, data: { ncm: fis.ncm, ...(fis.cest ? { cest: fis.cest } : {}) } });
        enriquecidos++;
      } else {
        pulados++;
      }
      continue;
    }
    if (DRY) { criados++; if (criados <= 8) console.log(`  [dry] ${sku} ${item.descricao} | un=${item.unidade} estoque=${Math.max(0, item.qtd)} venda=${item.precoVenda} | NCM=${fis.ncm} CEST=${fis.cest} cat=${fis.categoria}`); continue; }
    try {
      await createProduct(scope, {
        sku,
        name: item.descricao,
        originalCode: item.codigo,
        type: "Produto",
        unit: item.unidade,
        category: fis.categoria || "Importado",
        priceValue: item.precoVenda,
        costValue: item.precoCusto,
        availableStock: Math.max(0, item.qtd),
        minimumStock: 0,
        ncm: fis.ncm || undefined,
        cest: fis.cest || undefined,
        origin: "0",
        cfopInState: "5102",
        cfopOutState: "6102"
      } as any);
      criados++;
      if (criados % 200 === 0) console.log(`  ...${criados} criados`);
    } catch (e) {
      erros++;
      if (erros <= 15) console.log(`  ❌ ${sku} "${item.descricao}": ${(e as Error)?.message}`);
    }
  }
  console.log(`\nResumo: criados=${criados} · enriquecidos(NCM)=${enriquecidos} · pulados=${pulados} · erros=${erros}`);
}

main().catch((e) => { console.error("ERRO:", e?.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
