import type { AgentTool } from "../../types";
import { listPurchaseOrdersForAgent } from "../../queries/purchasing-queries";

export const consultarCompras: AgentTool = {
  name: "consultar_compras",
  description:
    "Lista ou pesquisa pedidos de compra, com fornecedor, status, previsão, totais, produtos e quantidades recebidas.",
  mode: "read",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      numero: { type: "string", description: "Número inteiro ou parcial do pedido de compra." },
      fornecedor: { type: "string", description: "Nome do fornecedor." },
      status: { type: "string", enum: ["RASCUNHO", "ENVIADO", "PARCIAL", "RECEBIDO", "CANCELADO"] },
      limite: { type: "number", description: "Padrão 20, máximo 50." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => ({
    ok: true,
    data: await listPurchaseOrdersForAgent(scope, {
      numero: args.numero ? String(args.numero) : undefined,
      fornecedor: args.fornecedor ? String(args.fornecedor) : undefined,
      status: args.status ? String(args.status) : undefined,
      limite: args.limite == null ? undefined : Number(args.limite)
    })
  })
};
