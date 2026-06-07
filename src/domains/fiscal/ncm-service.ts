import { prisma } from "@/lib/db/prisma";

/** Limpa a descrição oficial do NCM para exibição: remove tags HTML, marcadores e espaços extras. */
export function limparDescricaoNcm(descricao: string): string {
  return descricao
    .replace(/<[^>]*>/g, " ")
    .replace(/^[\s-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza texto para busca: sem HTML, sem acentos, minúsculo. */
export function normalizarBusca(texto: string): string {
  return limparDescricaoNcm(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Normaliza um NCM para 8 dígitos (remove pontos/espaços). Retorna "" se não tiver 8 dígitos. */
export function normalizeNcm(codigo: string | null | undefined): string {
  const digits = (codigo ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : "";
}

/** Busca um NCM pelo código (8 dígitos). Retorna o registro oficial ou null se não existir. */
export async function findNcm(codigo: string | null | undefined) {
  const c = normalizeNcm(codigo);
  if (!c) return null;
  return prisma.ncm.findUnique({ where: { codigo: c } });
}

/** True se o NCM existe na tabela oficial — usado para ancorar/validar sugestões da IA. */
export async function ncmExiste(codigo: string | null | undefined): Promise<boolean> {
  return Boolean(await findNcm(codigo));
}

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "para", "com", "sem", "e", "ou", "a", "o", "as", "os",
  "em", "un", "ml", "kg", "g", "cm", "mm", "pc", "und", "litro", "litros", "natural"
]);

/**
 * Busca candidatos de NCM por palavras-chave da descrição (para o RAG: a IA escolhe entre
 * códigos reais). Estratégia simples e determinística: separa a descrição em termos relevantes
 * e busca descrições que contenham esses termos (case-insensitive), priorizando as que casam mais.
 */
/** Reduz um termo ao seu radical (prefixo) para casar plural/flexão: "mineral"→"miner" casa
 *  "minerais"; "parafuso"→"parafus" casa "parafusos". Tokens curtos (≤4) ficam inteiros. */
function stem(p: string): string {
  return p.length <= 4 ? p : p.slice(0, p.length - 2);
}

export async function searchNcm(termo: string, limite = 15) {
  const stems = normalizarBusca(termo)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    // Remove stopwords, termos curtos e tokens com dígitos (volumes/medidas tipo "500ml"),
    // que viram ruído porque quase nunca aparecem na descrição oficial do NCM.
    .filter((p) => p.length >= 3 && !STOPWORDS.has(p) && !/\d/.test(p))
    .map(stem)
    .slice(0, 6);

  if (!stems.length) return [];

  const select = { codigo: true, descricao: true, descricaoBusca: true } as const;

  // 1) Precisão: NCMs cuja descrição contém TODOS os radicais (AND). Pega o caso típico.
  const andRes = await prisma.ncm.findMany({
    where: { AND: stems.map((p) => ({ descricaoBusca: { contains: p } })) },
    take: 80,
    select
  });

  // 2) Reserva: se vier pouco, completa com OR (qualquer radical) para não voltar vazio.
  const orRes =
    andRes.length >= limite
      ? []
      : await prisma.ncm.findMany({
          where: { OR: stems.map((p) => ({ descricaoBusca: { contains: p } })) },
          take: 300,
          select
        });

  const vistos = new Set<string>();
  const candidatos = [...andRes, ...orRes].filter((c) => (vistos.has(c.codigo) ? false : vistos.add(c.codigo)));

  const pontuado = candidatos
    .map((c) => {
      const score = stems.reduce((acc, p) => acc + (c.descricaoBusca.includes(p) ? 1 : 0), 0);
      return { codigo: c.codigo, descricao: limparDescricaoNcm(c.descricao), score };
    })
    .sort((a, b) => b.score - a.score || a.codigo.localeCompare(b.codigo))
    .slice(0, limite);

  return pontuado.map(({ codigo, descricao }) => ({ codigo, descricao }));
}
