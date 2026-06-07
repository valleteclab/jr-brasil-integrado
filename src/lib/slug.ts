/** Converte um texto em slug de URL (sem acentos, minúsculo, hifenizado). Compartilhado por
 *  servidor e cliente (ex.: slug da loja virtual). */
export function slugify(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}
