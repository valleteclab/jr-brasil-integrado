import type { AgentTool } from "../../types";
import { listPayablesForAgent } from "../../queries/payable-queries";

export const consultarContasPagar: AgentTool = {
  name: "consultar_contas_pagar",
  description:
    "Lista contas a pagar da empresa ativa, com fornecedor, vencimento, valor, saldo e situação. Sem status informado retorna somente títulos em aberto, parciais ou vencidos.",
  mode: "read",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      fornecedor: { type: "string", description: "Nome ou documento do fornecedor." },
      status: { type: "string", enum: ["ABERTO", "PARCIAL", "VENCIDO", "PAGO", "CANCELADO"] },
      vencimentoDias: { type: "number", description: "Títulos vencendo até os próximos N dias; também inclui atrasados." },
      limite: { type: "number", description: "Padrão 20, máximo 50." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => ({
    ok: true,
    data: await listPayablesForAgent(scope, {
      fornecedor: args.fornecedor ? String(args.fornecedor) : undefined,
      status: args.status ? String(args.status) : undefined,
      vencimentoDias: args.vencimentoDias == null ? undefined : Number(args.vencimentoDias),
      limite: args.limite == null ? undefined : Number(args.limite)
    })
  })
};
