import type { AgentTool } from "../../types";
import { searchProducts } from "../../queries/product-queries";

export const buscarProduto: AgentTool = {
  name: "buscar_produto",
  description:
    "Busca produtos do catálogo por SKU, nome, código original ou GTIN. Retorna preço de venda, unidade e NCM. Use para encontrar o produtoId antes de montar orçamento/pré-venda.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR", "CLIENTE"],
  inputSchema: {
    type: "object",
    properties: {
      termo: { type: "string", description: "Texto de busca (SKU, nome, código ou GTIN)." },
      limite: { type: "number", description: "Máximo de resultados (1–30, padrão 10)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const data = await searchProducts(scope, { termo: args.termo as string, limite: args.limite as number });
    return { ok: true, data };
  }
};
