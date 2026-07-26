import type { AgentTool } from "../../types";
import { listSuppliersForAgent } from "../../queries/purchasing-queries";

export const consultarFornecedores: AgentTool = {
  name: "consultar_fornecedores",
  description:
    "Lista ou pesquisa fornecedores por nome ou documento, retornando contato, cidade, condição de pagamento e status.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      busca: { type: "string", description: "Razão social, nome fantasia, CPF ou CNPJ." },
      somenteAtivos: { type: "boolean", description: "Padrão true." },
      limite: { type: "number", description: "Padrão 20, máximo 50." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => ({
    ok: true,
    data: await listSuppliersForAgent(scope, {
      busca: args.busca ? String(args.busca) : undefined,
      somenteAtivos: args.somenteAtivos == null ? undefined : Boolean(args.somenteAtivos),
      limite: args.limite == null ? undefined : Number(args.limite)
    })
  })
};
