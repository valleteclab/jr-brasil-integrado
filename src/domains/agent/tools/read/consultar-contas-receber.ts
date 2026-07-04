import type { AgentTool } from "../../types";
import { listOpenReceivables } from "../../queries/receivable-queries";

export const consultarContasReceber: AgentTool = {
  name: "consultar_contas_receber",
  description:
    "Lista os títulos EM ABERTO no contas a receber (id, cliente, descrição, valor em aberto, vencimento). Use para achar o contaReceberId antes de emitir boleto ou cobrar via Pix. Filtre por nome/CPF/CNPJ do cliente quando souber.",
  mode: "read",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome, CPF ou CNPJ do cliente para filtrar (opcional)." },
      limite: { type: "number", description: "Máximo de títulos (padrão 20, máx 50)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const data = await listOpenReceivables(scope, {
      cliente: args.cliente ? String(args.cliente) : undefined,
      limite: args.limite ? Number(args.limite) : undefined
    });
    return { ok: true, data };
  }
};
