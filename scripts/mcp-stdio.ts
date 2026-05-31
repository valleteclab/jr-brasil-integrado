/**
 * Entrypoint stdio do servidor MCP (para Claude Desktop e clientes MCP locais).
 * Lê requisições JSON-RPC (uma por linha) do stdin e escreve respostas no stdout.
 * Autenticação: variável de ambiente JRB_AGENT_API_KEY (uma ChaveApiAgente).
 *
 * Uso (claude_desktop_config.json):
 *   "jr-brasil-erp": {
 *     "command": "npx",
 *     "args": ["tsx", "scripts/mcp-stdio.ts"],
 *     "env": { "JRB_AGENT_API_KEY": "jrb_agent_...", "DATABASE_URL": "...", "AI_CONFIG_SECRET": "..." }
 *   }
 */
import { createInterface } from "node:readline";
import { handleMcpRequest, type JsonRpcRequest } from "../src/mcp/server";
import { resolveTenantFromApiKey } from "../src/mcp/auth";

async function main() {
  const ctx = await resolveTenantFromApiKey(process.env.JRB_AGENT_API_KEY);
  if (!ctx) {
    process.stderr.write("JRB_AGENT_API_KEY inválida ou ausente. Gere uma chave em Configurações.\n");
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } }) + "\n");
      continue;
    }
    const response = await handleMcpRequest(req, ctx);
    if (response !== null) process.stdout.write(JSON.stringify(response) + "\n");
  }
}

main().catch((e) => {
  process.stderr.write(`Erro no MCP stdio: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
