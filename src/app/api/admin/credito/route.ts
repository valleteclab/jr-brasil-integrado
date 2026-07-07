import { NextResponse } from "next/server";
import { SessionError, ForbiddenError } from "@/lib/auth/session";
import {
  getCreditoPlataformaAdmin,
  salvarCreditoPlataformaAdmin,
  registrarWebhookAsaasAdmin,
  listCarteirasTenants,
  liberarCreditosAdmin
} from "@/lib/services/credito-plataforma-admin";

function statusFor(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  return 400;
}

export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get("carteiras") === "1") {
      return NextResponse.json({ carteiras: await listCarteirasTenants() });
    }
    return NextResponse.json(await getCreditoPlataformaAdmin());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown> & { acao?: string };
    if (body.acao === "liberar-creditos") {
      const r = await liberarCreditosAdmin(String(body.tenantId ?? ""), Number(body.valor ?? 0), String(body.motivo ?? "Cortesia"));
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.acao === "registrar-webhook") {
      const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
      const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim() || "";
      const base = host ? `${proto}://${host}` : "";
      const url = await registrarWebhookAsaasAdmin(base, String(body.email ?? "loamesilva@valleteclab.com.br"));
      return NextResponse.json({ ok: true, webhook: url });
    }
    const { acao, ...dados } = body;
    void acao;
    return NextResponse.json(await salvarCreditoPlataformaAdmin(dados as Parameters<typeof salvarCreditoPlataformaAdmin>[0]));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}
