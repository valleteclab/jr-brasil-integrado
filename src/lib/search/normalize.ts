/**
 * Normalização e correspondência de texto para buscas (produtos, clientes, etc.).
 *
 * O problema clássico: o usuário digita "açúcar" e o produto está cadastrado como "ACUCAR";
 * ou digita "aguá" e o cadastro é "AGUA". Comparar com includes() puro falha porque acento e
 * caixa diferem. Aqui removemos acentos e caixa dos DOIS lados antes de comparar, e dividimos a
 * busca em palavras (todas precisam aparecer) — assim "agua mineral" acha "ÁGUA MINERAL 500ML"
 * mesmo fora de ordem.
 */

/** Remove acentos/diacríticos, coloca em minúsculas e colapsa espaços. */
export function normalizarTexto(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove os diacríticos (acentos; "ç" → "c")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Indica se a busca casa com algum dos campos. A busca é normalizada e quebrada em palavras;
 * TODAS as palavras precisam aparecer no texto combinado dos campos (substring, sem acento/caixa).
 * Busca vazia casa com tudo.
 */
export function correspondeBusca(busca: string, ...campos: Array<string | null | undefined>): boolean {
  const termos = normalizarTexto(busca).split(" ").filter(Boolean);
  if (termos.length === 0) return true;
  const alvo = campos.map((c) => normalizarTexto(c)).join(" ");
  return termos.every((t) => alvo.includes(t));
}
