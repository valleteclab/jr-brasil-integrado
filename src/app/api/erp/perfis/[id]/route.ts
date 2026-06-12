import { NextResponse } from "next/server";
import { updatePerfilModulos, TeamValidationError } from "@/domains/team/application/team-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

// Atualiza os módulos de acesso de um perfil (RBAC por módulo).
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { modulos?: string[] };
    const result = await updatePerfilModulos(scope, params.id, Array.isArray(body.modulos) ? body.modulos : []);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar o perfil.";
    const status = authErrorStatus(error, error instanceof TeamValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}
