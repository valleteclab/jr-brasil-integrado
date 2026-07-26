import type { AgentTool } from "../../types";
import { listRecentOrders } from "../../queries/order-queries";

export const consultarPedidos: AgentTool = {
  name: "consultar_pedidos",
  description:
    "Lista pedidos de venda recentes da empresa ativa, com número, cliente, total, status e notas vinculadas. Use quando o usuário pedir todos, últimos ou recentes pedidos e ainda não souber um número específico.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome, CPF ou CNPJ do cliente (opcional)." },
      status: {
        type: "string",
        enum: ["RASCUNHO", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_NOTA", "SEPARACAO", "ENVIADO", "ENTREGUE", "CANCELADO"],
        description: "Status opcional do pedido."
      },
      periodoDias: { type: "number", description: "Somente pedidos dos últimos N dias (opcional)." },
      limite: { type: "number", description: "Máximo de pedidos retornados (padrão 20, máximo 50)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const data = await listRecentOrders(scope, {
      cliente: args.cliente ? String(args.cliente) : undefined,
      status: args.status ? String(args.status) : undefined,
      periodoDias: args.periodoDias == null ? undefined : Number(args.periodoDias),
      limite: args.limite == null ? undefined : Number(args.limite)
    });
    return { ok: true, data };
  }
};
