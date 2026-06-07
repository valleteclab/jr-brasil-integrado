/**
 * Open Food Facts: banco aberto e gratuito de produtos alimentícios. Consulta a imagem do produto
 * por código de barras (GTIN). Sem chave de API; cobre apenas alimentos/mercearia — usado como
 * fallback de imagem quando o Dataload não tem.
 */
const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";

/** Retorna a URL da imagem (frontal) do produto no Open Food Facts, ou null se não houver. */
export async function consultarImagemOpenFoodFacts(gtin: string): Promise<string | null> {
  const ean = (gtin ?? "").replace(/\D/g, "");
  if (ean.length < 8) return null;
  try {
    const res = await fetch(`${OFF_BASE}/${ean}.json?fields=image_front_url,image_url`, {
      headers: { "User-Agent": "JR-Brasil-ERP/1.0 (integracao-catalogo)" }
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      product?: { image_front_url?: string; image_url?: string };
    };
    return data.product?.image_front_url || data.product?.image_url || null;
  } catch {
    return null;
  }
}
