import type { AgentTool } from "../../types";
import { salesReport } from "@/lib/services/reports";

export const relatorioVendas: AgentTool = {
  name: "relatorio_vendas",
  description:
    "Relatório de vendas dos últimos N dias (padrão 30): total, ticket médio, vendas por dia e produtos mais vendidos.",
  mode: "read",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      periodoDias: { type: "number", description: "Período em dias (padrão 30)." }
    },
    additionalProperties: false
  },
  handler: async (_scope, args) => {
    const periodo = typeof args.periodoDias === "number" ? args.periodoDias : 30;
    const data = await salesReport(periodo);
    return { ok: true, data };
  }
};
