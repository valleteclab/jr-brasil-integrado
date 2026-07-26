import type { AgentTool } from "../../types";
import { getCashFlowForAgent } from "../../queries/payable-queries";

export const consultarFluxoCaixa: AgentTool = {
  name: "consultar_fluxo_caixa",
  description:
    "Resume o fluxo de caixa da empresa ativa: saldo bancário, entradas/saídas projetadas, atrasados, saldo final estimado e realizado no período.",
  mode: "read",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      periodoDias: { type: "number", description: "Horizonte projetado e janela do realizado (padrão 30, máximo 365)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => ({
    ok: true,
    data: await getCashFlowForAgent(scope, {
      periodoDias: args.periodoDias == null ? undefined : Number(args.periodoDias)
    })
  })
};
