import { NextResponse } from "next/server";
import { inviteColaborador, TeamValidationError } from "@/domains/team/application/team-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json();
    const result = await inviteColaborador(scope, body);
    return NextResponse.json({ id: result.vinculo.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao convidar colaborador.";
    const status = error instanceof TeamValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
