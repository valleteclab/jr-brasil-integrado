/**
 * De/Para fiscal DETERMINÍSTICO por tipo de peça para o catálogo de autopeças da JR Brasil
 * (cardans/cruzetas Dana-Spicer, rolamentos, direção, freio, fixadores…).
 *
 * A coluna "Descrição" do catálogo tem vocabulário pequeno e repetitivo: cada família de peça
 * casa com um NCM. Aqui a classificação é por REGRA (regex ordenada, primeira que casa vence),
 * auditável e sem "chutar" item a item. O NCM ainda é validado contra a tabela oficial no import
 * (findNcm); se não existir, cai para a subposição de 6 dígitos ou fica sem NCM (nunca grava NCM
 * inválido que a SEFAZ rejeitaria).
 *
 * PIS/COFINS MONOFÁSICO (Lei 10.485 — autopeças): NCMs 8708/8482/8483/8409 são monofásicos; o
 * detector do sistema (grupoMonofasicoDoNcm) já reconhece, e marcamos aqui também.
 * ORIGEM: padrão "0" (nacional). Rolamentos de marca importada (NSK/NTN/KOYO/SKF/GBR/ZWZ/FRM)
 * ficam com revisar=true para o usuário confirmar origem 1/2 (não temos a NF de compra aqui).
 */

export type ClasseFiscal = {
  /** Rótulo da família (categoria sugerida do produto). */
  familia: string;
  ncm: string;
  cest?: string | null;
  /** PRODUTO (mercadoria de revenda) | SERVICO | INSUMO. */
  tipo?: "Produto" | "Servico" | "Insumo";
  /** Marca para revisão manual do NCM/origem antes de emitir. */
  revisar?: boolean;
  motivoRevisar?: string;
};

type Regra = { re: RegExp } & ClasseFiscal;

// A ordem importa: regras mais específicas primeiro.
const REGRAS: Regra[] = [
  // ── Itens que NÃO são mercadoria de revenda (tratados à parte) ─────────────
  { re: /\bservi[çc]o\b|usinagem/i, familia: "Serviço", ncm: "", tipo: "Servico", revisar: true, motivoRevisar: "Serviço, não é mercadoria — confirmar." },
  { re: /uso da oficina|marreta|alicate/i, familia: "Ferramenta/uso interno", ncm: "82055900", tipo: "Insumo", revisar: true, motivoRevisar: "Uso interno da oficina (não revenda)." },
  { re: /\bsucata\b/i, familia: "Sucata", ncm: "72044900", tipo: "Produto", revisar: true, motivoRevisar: "Sucata — NCM/segmento próprio." },

  // ── Rolamentos (8482) — por tipo ───────────────────────────────────────────
  { re: /rolamento.*(c[oô]nic|autocomp.*rols|autocompensador.*rol)/i, familia: "Rolamento de rolos", ncm: "84822010", revisar: true, motivoRevisar: "Rolamento importado? confirmar origem." },
  { re: /rolamento.*(agulha)/i, familia: "Rolamento de agulhas", ncm: "84824000", revisar: true, motivoRevisar: "Rolamento importado? confirmar origem." },
  { re: /rolamento.*(autocompensador)/i, familia: "Rolamento autocompensador", ncm: "84823000", revisar: true, motivoRevisar: "Rolamento importado? confirmar origem." },
  { re: /\brolamento\b/i, familia: "Rolamento de esferas", ncm: "84821010", revisar: true, motivoRevisar: "Rolamento importado? confirmar origem." },
  { re: /mancal (tipo flange|industrial|do rolamento uc)|mancal.*\buc\b|\bmancal\b.*flange/i, familia: "Mancal com rolamento", ncm: "84832000", revisar: true },

  // ── Retentores / borrachas / coifas ────────────────────────────────────────
  { re: /retentor/i, familia: "Retentor (junta de vedação)", ncm: "40169300" },
  { re: /coifa|borracha sanfona|borracha do rolamento|borracha do suporte|coxim/i, familia: "Peça de borracha (autopeça)", ncm: "40169990" },

  // ── Fixadores (73.18) ──────────────────────────────────────────────────────
  { re: /^porca\b|\bporca\b/i, familia: "Porca", ncm: "73181600" },
  { re: /arruela/i, familia: "Arruela", ncm: "73182200" },
  { re: /pino el[aá]stico|\bchaveta\b/i, familia: "Pino/chaveta", ncm: "73182900" },
  { re: /parafuso|grampo u/i, familia: "Parafuso", ncm: "73181500" },
  { re: /abra[çc]adeira/i, familia: "Abraçadeira", ncm: "73269090" },
  { re: /engraxadeira|graxeiro/i, familia: "Engraxadeira (graxeiro)", ncm: "84818099", revisar: true, motivoRevisar: "Graxeiro: confirmar 8481.80 x autopeça." },

  // ── Freio / direção / suspensão (8708 específicos) ─────────────────────────
  { re: /pastilha de freio|cilindro.*freio|c[aâ]mara de freio/i, familia: "Freio", ncm: "87083090" },
  { re: /coluna de dire[çc][aã]o|barra de dire[çc][aã]o|terminal de dire[çc][aã]o|caixa de dire[çc][aã]o/i, familia: "Direção", ncm: "87089490" },
  { re: /pivo|piv[oô]|bieleta|tirante|articula[çc][aã]o axial|barra em v|barra torcao|barra de tor[çc][aã]o/i, familia: "Direção/suspensão", ncm: "87089990" },
  { re: /pino manga de eixo|embuchamento manga|bucha manga eixo|bolsa de ar/i, familia: "Suspensão/eixo", ncm: "87089990" },

  // ── Homocinética / semi-eixo / cubo ────────────────────────────────────────
  { re: /homocin[eé]tic|semi.?eixo|tulipa|trip[eé][çc]a|cubo (de )?roda|ponta homoc/i, familia: "Homocinética/semi-eixo", ncm: "87089990" },

  // ── Peças agrícolas de TDP (tomada de potência) — árvore de transmissão ────
  { re: /agr[ií]col|s[eé]rie verde|tdp serie|molinete|enxada rotativa/i, familia: "Transmissão agrícola (TDP)", ncm: "84839000", revisar: true, motivoRevisar: "TDP/agrícola: 8483.90 x peça de máquina agrícola." },
  { re: /embreagem|disco de fric[çc][aã]o|n[uú]cleo central|cubo agr[ií]cola|conjunto de embreagem|flange embreagem/i, familia: "Embreagem/transmissão", ncm: "84839000", revisar: true },

  // ── CARDAN e suas partes (o grosso do catálogo) → 8708.99.90 ───────────────
  { re: /cruzeta|junta universal|junta automotiva|junta autom[aá]tica|junta agr[ií]cola/i, familia: "Cruzeta/junta do cardan", ncm: "87089990" },
  { re: /cardan|eixo cardan|luva|garfo|ponteira|pont[uú]va|luveira|terminal|flange|yoke|mancal|bra[çc]adeira|defletor|barra quadrada|tubo (quadrado|triangular|oval|do cardan)|kit cardan|arvore (de )?transmiss|luveiro|pontuva/i, familia: "Peça de cardan", ncm: "87089990" }
];

const FALLBACK: ClasseFiscal = { familia: "Autopeça (revisar)", ncm: "87089990", revisar: true, motivoRevisar: "Sem regra específica — assumida autopeça 8708.99.90; revisar." };

// Sinais de peça AGRÍCOLA (TDP/tomada de potência, série verde, tratores). O NCM road-vehicle
// 8708 x transmissão agrícola 8483/máquina agrícola muda a tributação — sinalizamos para revisão.
const RE_AGRICOLA = /\bagr[ií]col|s[eé]rie verde|\btdp\b|\btrator|massey|valtra|valmet|john ?de|new ?holland|agrale|fendt|lavrale|enxada rotativa|adubadeira|encilade|colheit|plataforma cotton/i;

/**
 * Classifica pela DESCRIÇÃO (o tipo da peça). O Detalhe/Aplicação NÃO decidem a família (evita que
 * "COM GRAXEIRO" no detalhe vire "engraxadeira"); servem só para marcar revisão agrícola.
 */
export function classificarFiscal(descricao: string, contexto = ""): ClasseFiscal {
  let classe: ClasseFiscal | null = null;
  for (const r of REGRAS) {
    if (r.re.test(descricao)) { const { re, ...c } = r; classe = c; break; }
  }
  if (!classe) classe = { ...FALLBACK };
  // Reforço agrícola: cardan/autopeça (8708/8483) cuja aplicação é de TDP/trator → validar 8483.90.
  const ehCardanOuTransm = classe.ncm.startsWith("8708") || classe.ncm.startsWith("8483");
  if (ehCardanOuTransm && !classe.revisar && RE_AGRICOLA.test(`${descricao} ${contexto}`)) {
    classe = { ...classe, revisar: true, motivoRevisar: "Aplicação agrícola (TDP) — validar 8483.90 x 8708.99." };
  }
  return classe;
}

/** NCMs monofásicos de autopeça (Lei 10.485) — prefixos. */
export function ehMonofasico(ncm: string | null | undefined): boolean {
  const n = (ncm ?? "").replace(/\D/g, "");
  return ["8708", "8482", "8483", "8409"].some((p) => n.startsWith(p));
}

/**
 * Marca/linha embutida no SUFIXO do código do cliente (ex.: 035.10.LN → LN, 040.26.NSK → NSK).
 * Só um De/Para de rótulo — o que não estiver aqui usa o próprio sufixo como marca.
 */
const MARCAS: Record<string, string> = {
  SPI: "Spicer", STH: "Sethon", LN: "LNG", LNG: "LNG", CC: "CC", NK: "NTN", NSK: "NSK", SKF: "SKF",
  KOYO: "Koyo", GBR: "GBR", ZWZ: "ZWZ", FRM: "FRM", NTN: "NTN", SNR: "SNR", SRM: "SRM",
  RCB: "RCB (recuperado)", RAP: "RAP", AEM: "AEM", ALB: "Albarus", AMX: "AMX", MRT: "MRT",
  IN: "Inpel", INP: "Inpel", STU: "STU", NOB: "Nobre", BR: "BR", SC: "Soro", SR: "Suporte Rei",
  TB: "Tubos", PA: "Pantera", MEC: "MEC", MDR: "MDR", ELB: "Elbe", SB: "Sabó", DRC: "DRC",
  KP: "KP", ICT: "ICT", CIP: "CIP", HDS: "HDS", PTR: "Petronni", MIL: "MIL", FEY: "Fey",
  DIST: "Distribuidor", KIT: "Kit", CB: "CB", LZ: "LZ", LX: "LX", T7E: "T7E"
};

/** Extrai a marca do sufixo do SKU do cliente. Retorna null se não houver sufixo reconhecível. */
export function marcaDoSku(sku: string): string | null {
  const partes = sku.split(".");
  if (partes.length < 2) return null;
  const suf = partes[partes.length - 1].toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Só trata como marca quando o sufixo é puramente alfabético (LN, STH, SPI, NSK…). Sufixos com
  // dígitos (ex.: 121.1048NK, 110.33.00) não são linha de marca.
  if (!/^[A-Z]{2,5}$/.test(suf)) return null;
  return MARCAS[suf] ?? suf;
}
