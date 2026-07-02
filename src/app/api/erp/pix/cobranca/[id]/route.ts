import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PixError, sincronizarPix } from "@/domains/finance/application/pix-use-cases";

/** Verifica o pagamento da cobrança Pix (consulta o Sicoob; paga + título vinculado = baixa). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const r = await sincronizarPix(scope, params.id);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao verificar a cobrança Pix.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PixError ? 400 : 500) });
  }
}
