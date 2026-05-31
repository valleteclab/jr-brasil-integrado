import type { AgentTool } from "../../types";
import { getStockBalance } from "../../queries/stock-queries";

export const consultarEstoque: AgentTool = {
  name: "consultar_estoque",
  description:
    "Consulta o saldo de estoque de um produto (por SKU ou produtoId), somando os depósitos da empresa. Retorna quantidade, reservado e disponível.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      sku: { type: "string", description: "SKU do produto." },
      produtoId: { type: "string", description: "Id do produto (alternativa ao SKU)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const data = await getStockBalance(scope, { sku: args.sku as string, produtoId: args.produtoId as string });
    return { ok: true, data };
  }
};
