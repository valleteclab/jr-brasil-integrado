/**
 * Importa o catálogo de autopeças da JR Brasil (CSV do cliente) como produtos, com classificação
 * fiscal DETERMINÍSTICA por tipo de peça (scripts/catalogo-jr-depara.ts). Roda em PRODUÇÃO (VPS),
 * onde existe o cadastro da JR Brasil.
 *
 * Uso:
 *   npx tsx scripts/import-catalogo-jr.ts --empresa=<id> [--arquivo=scripts/catalogo-jr.csv]
 *          [--limit=N] [--dry] [--relatorio]
 *
 * --dry        não grava; classifica e imprime amostra + resumo (não precisa de DB).
 * --relatorio  imprime a tabela família→NCM→quantidade e a lista de itens "revisar".
 * --limit=N    processa só as N primeiras linhas.
 *
 * Idempotente: SKU = "cod interno do cliente" (maiúsculo). Se já existir, pula; se existir sem NCM
 * e agora temos, enriquece. Re-rodar é seguro.
 *
 * Mapeamento das colunas (nada se perde):
 *   cod interno do cliente → sku          | Descrição            → nome
 *   codigo fornecedores    → cod. fornec. | Detalhe + Ø copinho/rolamento/face → descrição técnica
 *   Aplicação              → ProdutoAplicacao (modelo)
 */
import fs from "node:fs";
import { prisma } from "../src/lib/db/prisma";
import { createProduct } from "../src/domains/products/application/product-use-cases";
import { findNcm } from "../src/domains/fiscal/ncm-service";
import { classificarFiscal, ehMonofasico, marcaDoSku } from "./catalogo-jr-depara";

const arg = (k: string, d = "") => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const has = (k: string) => process.argv.includes(`--${k}`);

const EMPRESA_ID = arg("empresa");
const ARQUIVO = arg("arquivo", "scripts/catalogo-jr.csv");
const LIMIT = Number(arg("limit", "0")) || 0;
const DRY = has("dry");
const RELATORIO = has("relatorio");

/** Conserta mojibake comum (arquivo Latin-1 lido como UTF-8) e os símbolos técnicos do catálogo. */
function demojibake(s: string): string {
  if (!/Ã|Â|Ó¨|â¡|Î|Ãµ/.test(s)) return s;
  const map: Array<[RegExp, string]> = [
    [/Ã§/g, "ç"], [/Ã£/g, "ã"], [/Ãµ/g, "õ"], [/Ã©/g, "é"], [/Ãª/g, "ê"], [/Ã¡/g, "á"], [/Ã¢/g, "â"],
    [/Ã /g, "à"], [/Ã­/g, "í"], [/Ã³/g, "ó"], [/Ã´/g, "ô"], [/Ãº/g, "ú"], [/Ã‰/g, "É"], [/Ã‡/g, "Ç"],
    [/Ã•/g, "Õ"], [/Ãƒ/g, "Ã"], [/Â°/g, "°"], [/Âº/g, "º"], [/Âª/g, "ª"], [/Â¨/g, "¨"], [/Â´/g, "´"],
    [/Ó¨/g, "Ø"], [/â¡/g, "□"], [/Î/g, "Δ"], [/Â/g, ""]
  ];
  let out = s;
  for (const [re, r] of map) out = out.replace(re, r);
  return out;
}

/** Parser CSV simples com aspas (campos podem conter vírgula entre aspas). */
function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "", registro: string[] = [], aspas = false;
  const push = () => { registro.push(campo); campo = ""; };
  const eol = () => { push(); linhas.push(registro); registro = []; };
  const t = texto.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else {
      if (c === '"') aspas = true;
      else if (c === ",") push();
      else if (c === "\n") eol();
      else campo += c;
    }
  }
  if (campo || registro.length) eol();
  return linhas.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Descrição técnica legível a partir do Detalhe + dimensões do cardan. */
function fichaTecnica(detalhe: string, copinho: string, rolamento: string, face: string): string {
  const partes: string[] = [];
  if (detalhe.trim()) partes.push(detalhe.trim());
  const dims: string[] = [];
  if (copinho.trim()) dims.push(`Ø copinho ${copinho.trim()}`);
  if (rolamento.trim()) dims.push(`Ø rolamento ${rolamento.trim()}`);
  if (face.trim()) dims.push(`face a face ${face.trim()}`);
  if (dims.length) partes.push(dims.join(" · "));
  return partes.join(" | ");
}

/** Resolve o NCM: exato na tabela oficial; senão uma folha da mesma subposição (6 díg); senão null. */
async function resolverNcm(ncm: string): Promise<string | null> {
  if (!ncm) return null;
  const exato = await findNcm(ncm);
  if (exato?.codigo) return exato.codigo;
  const folha = await prisma.ncm.findFirst({
    where: { codigo: { startsWith: ncm.slice(0, 6) } }, orderBy: { codigo: "asc" }, select: { codigo: true }
  });
  return folha?.codigo ?? null;
}

type Col = { sku: number; desc: number; forn: number; det: number; apl: number; cop: number; rol: number; face: number };

/** Localiza as colunas pelo cabeçalho (tolerante a mojibake/variações). */
function mapearColunas(header: string[]): Col {
  const norm = header.map((h) => demojibake(h).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const idx = (frag: string) => norm.findIndex((h) => h.includes(frag));
  return {
    sku: idx("cod interno"), desc: idx("descri"), forn: idx("fornecedor"), det: idx("detalhe"),
    apl: idx("aplica"), cop: idx("copinho"), rol: idx("rolamento"), face: idx("face")
  };
}

async function main() {
  if (!fs.existsSync(ARQUIVO)) throw new Error(`Arquivo não encontrado: ${ARQUIVO}`);
  const linhas = parseCsv(fs.readFileSync(ARQUIVO, "utf8"));
  if (!linhas.length) throw new Error("CSV vazio.");
  const col = mapearColunas(linhas[0]);
  if (col.sku < 0 || col.desc < 0) throw new Error(`Cabeçalho inesperado: ${linhas[0].join(" | ")}`);

  let dados = linhas.slice(1);
  if (LIMIT > 0) dados = dados.slice(0, LIMIT);

  // Classificação prévia (para dry/relatório) — determinística, não precisa de DB.
  const porFamilia = new Map<string, number>();
  const porNcm = new Map<string, number>();
  const revisar: Array<{ sku: string; nome: string; motivo: string }> = [];
  const registros = dados.map((r) => {
    const sku = demojibake(r[col.sku] ?? "").trim().toUpperCase();
    const nome = demojibake(r[col.desc] ?? "").trim();
    const forn = demojibake(r[col.forn] ?? "").trim();
    const det = demojibake(r[col.det] ?? "").trim();
    const apl = demojibake(r[col.apl] ?? "").trim();
    const cop = demojibake(r[col.cop] ?? "").trim();
    const rol = demojibake(r[col.rol] ?? "").trim();
    const face = demojibake(r[col.face] ?? "").trim();
    const classe = classificarFiscal(nome, det);
    porFamilia.set(classe.familia, (porFamilia.get(classe.familia) ?? 0) + 1);
    porNcm.set(classe.ncm || "(sem NCM)", (porNcm.get(classe.ncm || "(sem NCM)") ?? 0) + 1);
    if (classe.revisar) revisar.push({ sku, nome, motivo: classe.motivoRevisar ?? "" });
    return { sku, nome, forn, det, apl, cop, rol, face, classe };
  }).filter((x) => x.sku && x.nome);

  console.log(`Arquivo: ${ARQUIVO} · linhas de dados: ${dados.length} · válidas: ${registros.length}`);

  if (RELATORIO || DRY) {
    console.log(`\n── Famílias (${porFamilia.size}) ──`);
    [...porFamilia.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${String(n).padStart(5)}  ${f}`));
    console.log(`\n── NCM ──`);
    [...porNcm.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${String(n).padStart(5)}  ${f}`));
    console.log(`\n── A revisar: ${revisar.length} ──`);
    revisar.slice(0, 30).forEach((r) => console.log(`  ${r.sku}  ${r.nome} — ${r.motivo}`));
    if (revisar.length > 30) console.log(`  …+${revisar.length - 30}`);
    console.log("\n── Amostra ──");
    registros.slice(0, 10).forEach((x) => console.log(`  ${x.sku} | ${x.nome} | ${x.classe.familia} → ${x.classe.ncm || "—"} | marca=${marcaDoSku(x.sku) ?? "-"}`));
  }

  if (DRY) { console.log("\n(dry-run — nada gravado)"); return; }

  if (!EMPRESA_ID) throw new Error("Informe --empresa=<id> para gravar (rode com --dry para só validar).");
  const empresa = await prisma.empresa.findUnique({ where: { id: EMPRESA_ID }, select: { id: true, tenantId: true, razaoSocial: true } });
  if (!empresa) throw new Error(`Empresa ${EMPRESA_ID} não encontrada.`);
  const scope = { tenantId: empresa.tenantId, empresaId: empresa.id };
  console.log(`\nEmpresa: ${empresa.razaoSocial} (${empresa.id})`);

  // Resolve os NCM distintos uma vez (valida contra a tabela oficial).
  const ncmsDistintos = [...new Set(registros.map((x) => x.classe.ncm).filter(Boolean))];
  const ncmMap = new Map<string, string | null>();
  for (const n of ncmsDistintos) ncmMap.set(n, await resolverNcm(n));
  console.log(`NCM distintos: ${ncmsDistintos.length} · resolvidos: ${[...ncmMap.values()].filter(Boolean).length}`);

  let criados = 0, enriquecidos = 0, pulados = 0, erros = 0, monof = 0;
  for (const x of registros) {
    const ncm = x.classe.ncm ? (ncmMap.get(x.classe.ncm) ?? null) : null;
    const existe = await prisma.produto.findUnique({
      where: { tenantId_empresaId_sku: { tenantId: scope.tenantId, empresaId: scope.empresaId, sku: x.sku } },
      select: { id: true, ncm: true }
    });
    if (existe) {
      if (!existe.ncm && ncm) { await prisma.produto.update({ where: { id: existe.id }, data: { ncm } }); enriquecidos++; }
      else pulados++;
      continue;
    }
    try {
      const produto = await createProduct(scope, {
        sku: x.sku,
        name: x.nome,
        type: x.classe.tipo === "Servico" ? "Servico" : x.classe.tipo === "Insumo" ? "Insumo" : "Produto",
        category: x.classe.familia,
        brand: marcaDoSku(x.sku) || "Sem marca",
        supplierCode: x.forn || undefined,
        technicalDescription: fichaTecnica(x.det, x.cop, x.rol, x.face) || undefined,
        unit: "UN",
        ncm: ncm || undefined,
        origin: "0",
        cfopInState: "5102",
        cfopOutState: "6102",
        availableStock: 0,
        minimumStock: 0,
        aplicacoes: x.apl ? [{ modelo: x.apl, observacoes: x.det || null }] : []
      } as any);
      // Marca PIS/COFINS monofásico para autopeças (Lei 10.485) — reforça o detector por NCM.
      if (ncm && ehMonofasico(ncm)) {
        await prisma.produtoFiscal.updateMany({ where: { produtoId: produto.id }, data: { pisCofinsMonofasico: true } });
        monof++;
      }
      criados++;
      if (criados % 200 === 0) console.log(`  ...${criados} criados`);
    } catch (e) {
      erros++;
      if (erros <= 20) console.log(`  ❌ ${x.sku} "${x.nome}": ${(e as Error)?.message}`);
    }
  }
  console.log(`\nResumo: criados=${criados} (monofásico=${monof}) · enriquecidos(NCM)=${enriquecidos} · pulados=${pulados} · erros=${erros}`);
}

main().catch((e) => { console.error("ERRO:", e?.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
