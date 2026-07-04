/**
 * Importação do catálogo de autopeças da JR Brasil (CSV do cliente) como produtos, com
 * classificação fiscal DETERMINÍSTICA por tipo de peça (Descrição → NCM). Núcleo compartilhado
 * pelo script CLI (scripts/import-catalogo-jr.ts) e pelo endpoint de operação
 * (/api/cron/import-catalogo), que roda dentro do app contra o banco de PRODUÇÃO.
 *
 * Mapeamento das colunas (nada se perde):
 *   cod interno do cliente → sku          | Descrição → nome
 *   codigo fornecedores    → cod. fornec. | Detalhe + Ø copinho/rolamento/face → descrição técnica
 *   Aplicação              → ProdutoAplicacao (modelo)
 *   (sufixo do SKU)        → marca
 */
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createProduct } from "@/domains/products/application/product-use-cases";
import { findNcm } from "@/domains/fiscal/ncm-service";

// ─── De/Para fiscal por tipo de peça ─────────────────────────────────────────

export type ClasseFiscal = {
  familia: string;
  ncm: string;
  cest?: string | null;
  tipo?: "Produto" | "Servico" | "Insumo";
  revisar?: boolean;
  motivoRevisar?: string;
};

type Regra = { re: RegExp } & ClasseFiscal;

// Ordem importa: regras mais específicas primeiro.
const REGRAS: Regra[] = [
  // Itens que NÃO são mercadoria de revenda
  { re: /\bservi[çc]o\b|usinagem/i, familia: "Serviço", ncm: "", tipo: "Servico", revisar: true, motivoRevisar: "Serviço, não é mercadoria — confirmar." },
  { re: /uso da oficina|marreta|alicate/i, familia: "Ferramenta/uso interno", ncm: "82055900", tipo: "Insumo", revisar: true, motivoRevisar: "Uso interno da oficina (não revenda)." },
  { re: /\bsucata\b/i, familia: "Sucata", ncm: "72044900", tipo: "Produto", revisar: true, motivoRevisar: "Sucata — NCM/segmento próprio." },
  // Rolamentos (8482)
  { re: /rolamento.*(c[oô]nic|autocomp.*rols|autocompensador.*rol)/i, familia: "Rolamento de rolos", ncm: "84822010", revisar: true, motivoRevisar: "Rolamento importado? confirmar origem." },
  { re: /rolamento.*agulha/i, familia: "Rolamento de agulhas", ncm: "84824000", revisar: true, motivoRevisar: "Rolamento importado? confirmar origem." },
  { re: /rolamento.*autocompensador/i, familia: "Rolamento autocompensador", ncm: "84823000", revisar: true, motivoRevisar: "Rolamento importado? confirmar origem." },
  { re: /\brolamento\b/i, familia: "Rolamento de esferas", ncm: "84821010", revisar: true, motivoRevisar: "Rolamento importado? confirmar origem." },
  { re: /mancal (tipo flange|industrial|do rolamento uc)|mancal.*\buc\b|\bmancal\b.*flange/i, familia: "Mancal com rolamento", ncm: "84832000", revisar: true },
  // Retentores / borrachas
  { re: /retentor/i, familia: "Retentor (junta de vedação)", ncm: "40169300" },
  { re: /coifa|borracha sanfona|borracha do rolamento|borracha do suporte|coxim/i, familia: "Peça de borracha (autopeça)", ncm: "40169990" },
  // Fixadores (73.18)
  { re: /^porca\b|\bporca\b/i, familia: "Porca", ncm: "73181600" },
  { re: /arruela/i, familia: "Arruela", ncm: "73182200" },
  { re: /pino el[aá]stico|\bchaveta\b/i, familia: "Pino/chaveta", ncm: "73182900" },
  { re: /parafuso|grampo u/i, familia: "Parafuso", ncm: "73181500" },
  { re: /abra[çc]adeira/i, familia: "Abraçadeira", ncm: "73269090" },
  { re: /engraxadeira|graxeiro/i, familia: "Engraxadeira (graxeiro)", ncm: "84818099", revisar: true, motivoRevisar: "Graxeiro: confirmar 8481.80 x autopeça." },
  // Freio / direção / suspensão
  { re: /pastilha de freio|cilindro.*freio|c[aâ]mara de freio/i, familia: "Freio", ncm: "87083090" },
  { re: /coluna de dire[çc][aã]o|barra (de )?dire[çc][aã]o|terminal de dire[çc][aã]o|caixa de dire[çc][aã]o/i, familia: "Direção", ncm: "87089490" },
  { re: /pivo|piv[oô]|bieleta|tirante|articula[çc][aã]o axial|barra em v|barra torcao|barra de tor[çc][aã]o/i, familia: "Direção/suspensão", ncm: "87089990" },
  { re: /pino manga de eixo|embuchamento manga|bucha manga eixo|bolsa de ar/i, familia: "Suspensão/eixo", ncm: "87089990" },
  // Homocinética / semi-eixo / cubo
  { re: /homocin[eé]tic|semi.?eixo|tulipa|trip[eé][çc]a|cubo (de )?roda|ponta homoc/i, familia: "Homocinética/semi-eixo", ncm: "87089990" },
  // Peças agrícolas de TDP (árvore de transmissão)
  { re: /embreagem|disco de fric[çc][aã]o|n[uú]cleo central|cubo agr[ií]cola|conjunto de embreagem|flange embreagem/i, familia: "Embreagem/transmissão", ncm: "84839000", revisar: true },
  // CARDAN e partes → 8708.99.90
  { re: /cruzeta|junta universal|junta automotiva|junta autom[aá]tica|junta agr[ií]cola|trambulador/i, familia: "Cruzeta/junta do cardan", ncm: "87089990" },
  { re: /cardan|eixo cardan|\bluva\b|garfo|ponteira|pont[uú]va|luveira|terminal|flange|yoke|mancal|bra[çc]adeira|defletor|barra quadrada|tubo (quadrado|triangular|oval|do cardan)|kit cardan|arvore (de )?transmiss|pontuva|ponta de eixo|eixo prolongador/i, familia: "Peça de cardan", ncm: "87089990" }
];

const FALLBACK: ClasseFiscal = { familia: "Autopeça (revisar)", ncm: "87089990", revisar: true, motivoRevisar: "Sem regra específica — assumida autopeça 8708.99.90; revisar." };

const RE_AGRICOLA = /\bagr[ií]col|s[eé]rie verde|\btdp\b|\btrator|massey|valtra|valmet|john ?de|new ?holland|agrale|fendt|lavrale|enxada rotativa|adubadeira|encilade|colheit|plataforma cotton/i;

/** Classifica pela DESCRIÇÃO (o tipo da peça); contexto (detalhe/aplicação) só marca revisão agrícola. */
export function classificarFiscal(descricao: string, contexto = ""): ClasseFiscal {
  let classe: ClasseFiscal | null = null;
  for (const r of REGRAS) {
    if (r.re.test(descricao)) { const { re, ...c } = r; classe = c; break; }
  }
  if (!classe) classe = { ...FALLBACK };
  const ehCardanOuTransm = classe.ncm.startsWith("8708") || classe.ncm.startsWith("8483");
  if (ehCardanOuTransm && !classe.revisar && RE_AGRICOLA.test(`${descricao} ${contexto}`)) {
    classe = { ...classe, revisar: true, motivoRevisar: "Aplicação agrícola (TDP) — validar 8483.90 x 8708.99." };
  }
  return classe;
}

/** NCMs monofásicos de autopeça (Lei 10.485). */
export function ehMonofasico(ncm: string | null | undefined): boolean {
  const n = (ncm ?? "").replace(/\D/g, "");
  return ["8708", "8482", "8483", "8409"].some((p) => n.startsWith(p));
}

const MARCAS: Record<string, string> = {
  SPI: "Spicer", STH: "Sethon", LN: "LNG", LNG: "LNG", CC: "CC", NK: "NTN", NSK: "NSK", SKF: "SKF",
  KOYO: "Koyo", GBR: "GBR", ZWZ: "ZWZ", FRM: "FRM", NTN: "NTN", SNR: "SNR", SRM: "SRM",
  RCB: "RCB (recuperado)", RAP: "RAP", AEM: "AEM", ALB: "Albarus", AMX: "AMX", MRT: "MRT",
  IN: "Inpel", INP: "Inpel", STU: "STU", NOB: "Nobre", BR: "BR", SC: "Soro", SR: "Suporte Rei",
  TB: "Tubos", PA: "Pantera", MEC: "MEC", MDR: "MDR", ELB: "Elbe", SB: "Sabó", DRC: "DRC",
  KP: "KP", ICT: "ICT", CIP: "CIP", HDS: "HDS", PTR: "Petronni", MIL: "MIL", FEY: "Fey",
  DIST: "Distribuidor", KIT: "Kit", CB: "CB"
};

/** Marca embutida no sufixo do código do cliente (só sufixo puramente alfabético). */
export function marcaDoSku(sku: string): string | null {
  const partes = sku.split(".");
  if (partes.length < 2) return null;
  const suf = partes[partes.length - 1].toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{2,5}$/.test(suf)) return null;
  return MARCAS[suf] ?? suf;
}

// ─── Parser CSV + normalização ───────────────────────────────────────────────

/** Conserta mojibake comum (Latin-1 lido como UTF-8) e os símbolos técnicos do catálogo. */
export function demojibake(s: string): string {
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

/** Parser CSV com aspas (campos podem conter vírgula/quebra entre aspas). */
export function parseCsv(texto: string): string[][] {
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

type Col = { sku: number; desc: number; forn: number; det: number; apl: number; cop: number; rol: number; face: number };

function mapearColunas(header: string[]): Col {
  const norm = header.map((h) => demojibake(h).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const idx = (frag: string) => norm.findIndex((h) => h.includes(frag));
  return {
    sku: idx("cod interno"), desc: idx("descri"), forn: idx("fornecedor"), det: idx("detalhe"),
    apl: idx("aplica"), cop: idx("copinho"), rol: idx("rolamento"), face: idx("face")
  };
}

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

async function resolverNcm(ncm: string): Promise<string | null> {
  if (!ncm) return null;
  const exato = await findNcm(ncm);
  if (exato?.codigo) return exato.codigo;
  const folha = await prisma.ncm.findFirst({
    where: { codigo: { startsWith: ncm.slice(0, 6) } }, orderBy: { codigo: "asc" }, select: { codigo: true }
  });
  return folha?.codigo ?? null;
}

export type RegistroCatalogo = {
  sku: string; nome: string; forn: string; det: string; apl: string;
  cop: string; rol: string; face: string; classe: ClasseFiscal;
};

/** Analisa o CSV (sem tocar no banco): classifica e monta o relatório. */
export function analisarCatalogo(csvText: string, opts: { limit?: number } = {}) {
  const linhas = parseCsv(csvText);
  if (!linhas.length) throw new Error("CSV vazio.");
  const col = mapearColunas(linhas[0]);
  if (col.sku < 0 || col.desc < 0) throw new Error(`Cabeçalho inesperado: ${linhas[0].join(" | ")}`);
  let dados = linhas.slice(1);
  if (opts.limit && opts.limit > 0) dados = dados.slice(0, opts.limit);

  const porFamilia = new Map<string, number>();
  const porNcm = new Map<string, number>();
  const revisar: Array<{ sku: string; nome: string; motivo: string }> = [];
  const registros: RegistroCatalogo[] = dados.map((r) => {
    const g = (i: number) => demojibake(r[i] ?? "").trim();
    const sku = g(col.sku).toUpperCase();
    const nome = g(col.desc);
    const det = g(col.det);
    const classe = classificarFiscal(nome, `${det} ${g(col.apl)}`);
    porFamilia.set(classe.familia, (porFamilia.get(classe.familia) ?? 0) + 1);
    porNcm.set(classe.ncm || "(sem NCM)", (porNcm.get(classe.ncm || "(sem NCM)") ?? 0) + 1);
    if (classe.revisar) revisar.push({ sku, nome, motivo: classe.motivoRevisar ?? "" });
    return { sku, nome, forn: g(col.forn), det, apl: g(col.apl), cop: g(col.cop), rol: g(col.rol), face: g(col.face), classe };
  }).filter((x) => x.sku && x.nome);

  return {
    total: dados.length,
    validos: registros.length,
    porFamilia: Object.fromEntries([...porFamilia].sort((a, b) => b[1] - a[1])),
    porNcm: Object.fromEntries([...porNcm].sort((a, b) => b[1] - a[1])),
    revisarCount: revisar.length,
    revisar,
    amostra: registros.slice(0, 10).map((x) => ({ sku: x.sku, nome: x.nome, familia: x.classe.familia, ncm: x.classe.ncm || null, marca: marcaDoSku(x.sku) })),
    registros
  };
}

/** Importa de verdade: cria os produtos (idempotente por SKU) na empresa do scope. */
export async function importarCatalogo(scope: TenantScope, csvText: string, opts: { limit?: number } = {}) {
  const { registros } = analisarCatalogo(csvText, opts);

  const ncmsDistintos = [...new Set(registros.map((x) => x.classe.ncm).filter(Boolean))];
  const ncmMap = new Map<string, string | null>();
  for (const n of ncmsDistintos) ncmMap.set(n, await resolverNcm(n));

  let criados = 0, enriquecidos = 0, pulados = 0, erros = 0, monof = 0;
  const errosDetalhe: Array<{ sku: string; erro: string }> = [];
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
      });
      if (ncm && ehMonofasico(ncm)) {
        await prisma.produtoFiscal.updateMany({ where: { produtoId: produto.id }, data: { pisCofinsMonofasico: true } });
        monof++;
      }
      criados++;
    } catch (e) {
      erros++;
      if (errosDetalhe.length < 30) errosDetalhe.push({ sku: x.sku, erro: e instanceof Error ? e.message : "erro" });
    }
  }
  return { criados, monofasico: monof, enriquecidos, pulados, erros, errosDetalhe };
}
