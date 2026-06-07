/**
 * Integração com o banco de imagens Dataload (https://dataload.com.br/apiprodutos): consulta de
 * imagem de produto por código de barras (GTIN/EAN). É a fonte primária de imagens do catálogo —
 * sem cota diária (ao contrário do Cosmos) e com a URL servida diretamente pelo próprio serviço.
 *
 * API:
 *   GET {base}?ajax_action=consultar_unico&ean=<GTIN> → { encontrado, arquivo, url }
 *   GET {base}?ajax_action=ver_imagem&ean=<GTIN>      → image/png (a imagem em si, via HTTPS)
 */

/** Base configurável por ambiente; default aponta para o servidor do cliente. */
export function dataloadBase(): string {
  return (process.env.DATALOAD_BASE_URL || "https://dataload.com.br/apiprodutos/index.php").replace(/\/+$/, "");
}

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * URL HTTPS direta da imagem do GTIN (sem chamada de API). Use no `src` de <img> com um onError
 * de fallback; retorna null para GTIN inválido. NÃO garante que a imagem exista (use
 * consultarImagemDataload para verificar antes de persistir).
 */
export function imagemDataloadUrl(gtin: string | null | undefined): string | null {
  const ean = onlyDigits(gtin);
  if (ean.length < 8) return null;
  return `${dataloadBase()}?ajax_action=ver_imagem&ean=${ean}`;
}

export type DataloadImagem = { encontrado: boolean; url: string | null };

/** Verifica se a imagem do GTIN existe no Dataload e retorna a URL HTTPS quando existir. */
export async function consultarImagemDataload(gtin: string): Promise<DataloadImagem> {
  const ean = onlyDigits(gtin);
  if (ean.length < 8) throw new Error("Código de barras (GTIN/EAN) inválido.");

  let res: Response;
  try {
    res = await fetch(`${dataloadBase()}?ajax_action=consultar_unico&ean=${ean}`, {
      headers: { Accept: "application/json" }
    });
  } catch {
    throw new Error("Não foi possível conectar ao banco de imagens Dataload.");
  }
  if (!res.ok) throw new Error(`Dataload retornou erro ${res.status}.`);

  const data = (await res.json().catch(() => ({}))) as { encontrado?: boolean };
  return { encontrado: Boolean(data.encontrado), url: data.encontrado ? imagemDataloadUrl(ean) : null };
}
