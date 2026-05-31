import type { AgentTool } from "../../types";
import { listOwnOrders } from "../../queries/own-order-queries";

export const consultarMeusPedidos: AgentTool = {
  name: "consultar_meus_pedidos",
  description:
    "Lista os pedidos do próprio cliente (autoatendimento). Retorna número, status, total e notas. Restrito ao clienteId do solicitante.",
  mode: "read",
  roles: ["CLIENTE"],
  inputSchema: {
    type: "object",
    properties: {
      clienteId: { type: "string", description: "Id do cliente solicitante (injetado pelo canal)." },
      limite: { type: "number", description: "Máximo de pedidos (1–20, padrão 10)." }
    },
    required: ["clienteId"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const clienteId = String(args.clienteId ?? "");
    if (!clienteId) return { ok: false, data: null, error: "Cliente não identificado." };
    const data = await listOwnOrders(scope, clienteId, typeof args.limite === "number" ? args.limite : 10);
    return { ok: true, data };
  }
};
