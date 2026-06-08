/** Categorias sugeridas de despesa (a IA escolhe da lista; o usuário pode editar/digitar outra). */
export const DESPESA_CATEGORIAS = [
  "Alimentação",
  "Combustível",
  "Material/Insumos",
  "Serviços",
  "Água/Luz/Internet",
  "Manutenção",
  "Transporte",
  "Impostos/Taxas",
  "Outros"
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Canoniza o texto da IA para uma categoria da lista; cai em "Outros" se não casar. */
export function canonizarCategoria(valor: string | null | undefined): string {
  const v = (valor ?? "").trim();
  if (!v) return "Outros";
  const match = DESPESA_CATEGORIAS.find((c) => norm(c) === norm(v));
  return match ?? v.slice(0, 40);
}
