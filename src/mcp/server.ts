import type { TenantScope } from "@/lib/auth/dev-session";
import type { AgentRole } from "@/domains/agent/types";
import { getTool, getToolsForRole, toMcpTools } from "@/domains/agent/tools/registry";

/**
 * Núcleo do servidor MCP (Model Context Protocol) sobre JSON-RPC 2.0.
 * Compartilhado pelos transportes stdio (Claude Desktop) e HTTP/SSE (remoto).
 * Expõe as MESMAS ferramentas do chat web (src/domains/agent/tools/registry).
 * Apenas as tools permitidas para o `role` da chave autenticada são listadas/executadas.
 */

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "jr-brasil-erp", version: "1.0.0" };

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

export type McpContext = { scope: TenantScope; role: AgentRole };

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function err(id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/**
 * Processa uma requisição JSON-RPC do MCP. Retorna a resposta, ou `null` para
 * notificações (sem `id`), que não devem ser respondidas.
 */
export async function handleMcpRequest(
  req: JsonRpcRequest,
  ctx: McpContext
): Promise<JsonRpcResponse | null> {
  const isNotification = req.id === undefined || req.id === null;

  switch (req.method) {
    case "initialize":
      return ok(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      });

    case "notifications/initialized":
    case "ping":
      return isNotification ? null : ok(req.id, {});

    case "tools/list":
      return ok(req.id, { tools: toMcpTools(getToolsForRole(ctx.role)) });

    case "tools/call": {
      const params = req.params ?? {};
      const name = String(params.name ?? "");
      const args = (params.arguments as Record<string, unknown>) ?? {};
      const tool = getTool(name);
      if (!tool || !tool.roles.includes(ctx.role)) {
        return err(req.id, -32602, `Ferramenta indisponível para o perfil: ${name}`);
      }
      try {
        const result = await tool.handler(ctx.scope, args);
        // MCP retorna `content` (texto) + `isError`. Serializamos o resultado em JSON.
        return ok(req.id, {
          content: [{ type: "text", text: JSON.stringify(result.ok ? result.data : { error: result.error }) }],
          isError: !result.ok
        });
      } catch (e) {
        return ok(req.id, {
          content: [{ type: "text", text: JSON.stringify({ error: e instanceof Error ? e.message : "Falha na ferramenta." }) }],
          isError: true
        });
      }
    }

    default:
      return isNotification ? null : err(req.id, -32601, `Método não suportado: ${req.method}`);
  }
}
