import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { definirVendaFaturada, statusVendaFaturada } from "@/domains/credito/application/venda-faturada-use-cases";

/** Status da liberação de venda faturada do cliente (leitura). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const status = await statusVendaFaturada(scope, params.id);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: authErrorStatus(error, 500) });
  }
}

/** LIBERA/revoga venda faturada — restrito ao perfil FINANCEIRO. Body: { liberada, obs?, limiteCredito? }. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro"); // só quem tem o módulo financeiro libera
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { liberada: boolean; obs?: string | null; limiteCredito?: number | null };
    const r = await definirVendaFaturada(scope, params.id, body, session?.usuarioId);
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao liberar venda faturada.";
    return NextResponse.json({ error: msg }, { status: authErrorStatus(error, 400) });
  }
}
