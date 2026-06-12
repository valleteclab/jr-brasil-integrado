import { NextResponse } from "next/server";
import { inviteColaborador, TeamValidationError } from "@/domains/team/application/team-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const result = await inviteColaborador(scope, body);
    // senhaTemporaria só vem quando o usuário é novo — o admin repassa ao colaborador.
    return NextResponse.json(
      { id: result.vinculo.id, senhaTemporaria: result.senhaTemporaria },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao convidar colaborador.";
    const status = authErrorStatus(error, error instanceof TeamValidationError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}
