import type { AgentTool } from "../../types";
import { financeReport, dreSimplificado } from "@/lib/services/reports";

export const relatorioFinanceiro: AgentTool = {
  name: "relatorio_financeiro",
  description:
    "Relatório financeiro: contas a receber e a pagar (aberto, vencido, aging) e DRE simplificado (receita, CMV, despesas, margem) dos últimos N dias.",
  mode: "read",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      periodoDias: { type: "number", description: "Período do DRE em dias (padrão 30)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const periodo = typeof args.periodoDias === "number" ? args.periodoDias : 30;
    const [financeiro, dre] = await Promise.all([financeReport(scope), dreSimplificado(periodo, scope)]);
    return { ok: true, data: { contas: financeiro, dre } };
  }
};
