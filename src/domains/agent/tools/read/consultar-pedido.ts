import type { AgentTool } from "../../types";
import { getOrderStatus } from "../../queries/order-queries";

export const consultarPedido: AgentTool = {
  name: "consultar_pedido",
  description:
    "Consulta a situação de um pedido de venda pelo número (ex.: PV-000003): status, cliente, total e notas fiscais vinculadas.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      numero: { type: "string", description: "Número do pedido (ex.: PV-000003)." }
    },
    required: ["numero"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const data = await getOrderStatus(scope, { numero: args.numero as string });
    return { ok: true, data };
  }
};
