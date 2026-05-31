import type { AgentTool } from "../../types";
import { stockReport } from "@/lib/services/reports";

export const relatorioEstoque: AgentTool = {
  name: "relatorio_estoque",
  description:
    "Relatório de estoque atual: valor total, SKUs, itens críticos (abaixo do mínimo) e itens zerados, por categoria.",
  mode: "read",
  roles: ["GESTOR"],
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async (scope) => {
    const data = await stockReport(scope);
    return { ok: true, data };
  }
};
