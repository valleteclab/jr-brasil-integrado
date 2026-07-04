import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PixError, devolverPixDoTitulo } from "@/domains/finance/application/pix-use-cases";

/**
 * DEVOLVE o Pix recebido do título (valor total, via API BACEN) e estorna a baixa no ERP.
 * Movimenta dinheiro de volta ao pagador — restrito a ADMIN.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const resultado = await devolverPixDoTitulo(scope, params.id, session?.usuarioId);
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível devolver o Pix.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PixError ? 400 : 500) });
  }
}
