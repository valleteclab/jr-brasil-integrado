import { NextResponse } from "next/server";
import { authErrorStatus } from "@/lib/auth/http";
import {
  getCommercialAgentConfigSummary,
  saveCommercialAgentConfig
} from "@/domains/platform-sales/application/commercial-agent-config";

function baseUrl(request: Request): string | null {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim();
  return host ? `${proto}://${host}` : null;
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await getCommercialAgentConfigSummary(baseUrl(request)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar o agente comercial." },
      { status: authErrorStatus(error) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    await saveCommercialAgentConfig(body);
    return NextResponse.json(await getCommercialAgentConfigSummary(baseUrl(request)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar o agente comercial." },
      { status: authErrorStatus(error, 400) }
    );
  }
}
