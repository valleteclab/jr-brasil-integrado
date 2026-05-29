import { NextResponse } from "next/server";
import { setVinculoAtivo, TeamValidationError } from "@/domains/team/application/team-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json() as { ativo: boolean };
    if (typeof body.ativo !== "boolean") {
      return NextResponse.json({ error: 'Campo "ativo" (boolean) é obrigatório.' }, { status: 400 });
    }
    const vinculo = await setVinculoAtivo(scope, params.id, body.ativo);
    return NextResponse.json({ id: vinculo.id, ativo: vinculo.ativo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar status do colaborador.";
    const status = error instanceof TeamValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
