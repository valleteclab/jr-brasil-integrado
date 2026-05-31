import { NextResponse } from "next/server";
import { handleMcpRequest, type JsonRpcRequest } from "@/mcp/server";
import { resolveTenantFromApiKey } from "@/mcp/auth";

export const dynamic = "force-dynamic";

/**
 * Transporte HTTP do servidor MCP (Streamable HTTP / JSON-RPC).
 * Autentica por `Authorization: Bearer <chave>` (ChaveApiAgente por empresa).
 * Aceita uma requisição JSON-RPC ou um batch (array). Notificações não respondem.
 */
export async function POST(request: Request, { params }: { params: { transport: string } }) {
  if (params.transport !== "http" && params.transport !== "sse") {
    return NextResponse.json({ error: "Transporte não suportado." }, { status: 404 });
  }

  const ctx = await resolveTenantFromApiKey(request.headers.get("authorization"));
  if (!ctx) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Chave de API inválida ou ausente." } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } },
      { status: 400 }
    );
  }

  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((r) => handleMcpRequest(r as JsonRpcRequest, ctx)));
    return NextResponse.json(responses.filter((r) => r !== null));
  }

  const response = await handleMcpRequest(body as JsonRpcRequest, ctx);
  // Notificação (sem id) → 202 sem corpo.
  if (response === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(response);
}
