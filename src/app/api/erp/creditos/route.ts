import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getCarteira, listarRecargas } from "@/domains/credito/application/carteira-use-cases";

/** Saldo da carteira de créditos + histórico de recargas do tenant. */
export async function GET() {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const carteira = await getCarteira(scope);
    const recargas = await listarRecargas(scope);
    return NextResponse.json({
      saldo: Number(carteira.saldo),
      recargas: recargas.map((r) => ({ id: r.id, valor: Number(r.valor), status: r.status, criadoEm: r.criadoEm, pagoEm: r.pagoEm }))
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: authErrorStatus(error, 500) });
  }
}
