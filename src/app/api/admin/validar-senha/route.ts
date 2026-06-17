import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { authErrorStatus } from "@/lib/auth/http";
import { validarSenhaAdmin } from "@/lib/auth/admin-credential";

/**
 * Pré-validação da senha de administrador (qualquer admin do tenant). Usado pelo modal
 * que abre antes de finalizar uma venda com desconto acima do limite da empresa.
 * O servidor REVALIDA no momento do checkout — esta rota é só UX (não autoriza ação alguma).
 */
export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as { senha?: string };
    const { nome } = await validarSenhaAdmin(scope, body.senha ?? "");
    return NextResponse.json({ ok: true, autorizadoPor: nome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Senha de administrador inválida.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 401) });
  }
}
