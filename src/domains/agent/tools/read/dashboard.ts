import type { AgentTool } from "../../types";
import { getDashboardData } from "@/lib/services/dashboard";

export const dashboardTool: AgentTool = {
  name: "dashboard",
  description:
    "Resumo geral do negócio (KPIs): vendas do mês, contas a receber/pagar em aberto, notas autorizadas, itens críticos de estoque, pedidos recentes e OS abertas.",
  mode: "read",
  roles: ["GESTOR"],
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  handler: async () => {
    const data = await getDashboardData();
    return { ok: true, data };
  }
};
