import type { AgentTool } from "../../types";
import { searchCustomers } from "../../queries/customer-queries";

export const consultarCliente: AgentTool = {
  name: "consultar_cliente",
  description:
    "Busca clientes por nome, razão social ou documento (CPF/CNPJ). Retorna o clienteId necessário para montar orçamento/pré-venda.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      termo: { type: "string", description: "Nome, razão social ou documento do cliente." },
      limite: { type: "number", description: "Máximo de resultados (1–30, padrão 10)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const data = await searchCustomers(scope, { termo: args.termo as string, limite: args.limite as number });
    return { ok: true, data };
  }
};
