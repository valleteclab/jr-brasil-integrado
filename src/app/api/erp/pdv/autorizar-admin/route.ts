import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { validarCredencialAdmin } from "@/lib/auth/admin-credential";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

// Valida a credencial de um administrador para liberar uma ação no PDV (ex.: desconto).
// É só a pré-validação da UI — o checkout revalida a credencial no servidor.
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { email?: string; senha?: string };
    const admin = await validarCredencialAdmin(scope, { email: body.email ?? "", senha: body.senha ?? "" });
    return NextResponse.json({ ok: true, nome: admin.nome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Credencial de administrador inválida.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 401) });
  }
}
