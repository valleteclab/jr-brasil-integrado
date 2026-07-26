import type { AgentTool } from "../../types";
import { listQuotesForAgent } from "../../queries/quote-queries";

export const consultarOrcamentos: AgentTool = {
  name: "consultar_orcamentos",
  description:
    "Lista ou pesquisa orçamentos da empresa ativa, incluindo cliente, validade, total, status e itens. Filtra por número, cliente, status e período.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      numero: { type: "string", description: "Número inteiro ou parcial do orçamento." },
      cliente: { type: "string", description: "Nome, CPF ou CNPJ do cliente." },
      status: {
        type: "string",
        enum: ["RASCUNHO", "EM_ANALISE", "AGUARDANDO_CLIENTE", "APROVADO", "EXPIRADO", "REJEITADO", "CONVERTIDO"]
      },
      periodoDias: { type: "number", description: "Orçamentos criados nos últimos N dias." },
      limite: { type: "number", description: "Padrão 20, máximo 50." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => ({
    ok: true,
    data: await listQuotesForAgent(scope, {
      numero: args.numero ? String(args.numero) : undefined,
      cliente: args.cliente ? String(args.cliente) : undefined,
      status: args.status ? String(args.status) : undefined,
      periodoDias: args.periodoDias == null ? undefined : Number(args.periodoDias),
      limite: args.limite == null ? undefined : Number(args.limite)
    })
  })
};
