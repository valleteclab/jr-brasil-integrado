import type { AgentRole, AgentTool } from "../types";
import { buscarProduto } from "./read/buscar-produto";
import { consultarEstoque } from "./read/consultar-estoque";
import { consultarCliente } from "./read/consultar-cliente";
import { consultarPedido } from "./read/consultar-pedido";
import { relatorioVendas } from "./read/relatorio-vendas";
import { relatorioEstoque } from "./read/relatorio-estoque";
import { relatorioFinanceiro } from "./read/relatorio-financeiro";
import { dashboardTool } from "./read/dashboard";
import { consultarMeusPedidos } from "./read/consultar-meus-pedidos";
import { criarOrcamento } from "./write/criar-orcamento";
import { criarPreVenda } from "./write/criar-pre-venda";

/** Fonte única de verdade das ferramentas do agente — usada pelo chat web e (fase 2) pelo MCP. */
export const ALL_TOOLS: AgentTool[] = [
  buscarProduto,
  consultarEstoque,
  consultarCliente,
  consultarPedido,
  relatorioVendas,
  relatorioEstoque,
  relatorioFinanceiro,
  dashboardTool,
  consultarMeusPedidos,
  criarOrcamento,
  criarPreVenda
];

export function getToolsForRole(role: AgentRole): AgentTool[] {
  return ALL_TOOLS.filter((t) => t.roles.includes(role));
}

export function getTool(name: string): AgentTool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

/** Converte um conjunto de tools para o formato de function-calling da OpenAI/OpenRouter. */
export function toOpenAiTools(tools: AgentTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema
    }
  }));
}

/** Converte para o formato `tools/list` do MCP (JSON-RPC). Mesma fonte de verdade. */
export function toMcpTools(tools: AgentTool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }));
}
