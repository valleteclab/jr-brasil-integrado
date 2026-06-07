import { consultarImagemDataload } from "./dataload-service";
import { consultarImagemOpenFoodFacts } from "./openfoodfacts-service";

/**
 * Resolve a melhor imagem de um produto por GTIN, em cadeia de fontes:
 *   1) Dataload (banco próprio, forte em mercearia/varejo)
 *   2) Open Food Facts (aberto, alimentos)
 * Retorna a URL e a fonte, ou null se nenhuma tiver a imagem.
 */
export async function resolverImagemPorGtin(
  gtin: string
): Promise<{ url: string; fonte: "DATALOAD" | "OPENFOODFACTS" } | null> {
  const dl = await consultarImagemDataload(gtin).catch(() => null);
  if (dl?.encontrado && dl.url) return { url: dl.url, fonte: "DATALOAD" };

  const off = await consultarImagemOpenFoodFacts(gtin);
  if (off) return { url: off, fonte: "OPENFOODFACTS" };

  return null;
}
