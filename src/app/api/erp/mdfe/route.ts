import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { authErrorStatus } from "@/lib/auth/http";
import { emitirMdfe, listarMdfe, listarNfesParaManifesto } from "@/domains/fiscal/application/mdfe-use-cases";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const [manifestos, notas] = await Promise.all([listarMdfe(scope), listarNfesParaManifesto(scope)]);
    return NextResponse.json({ manifestos, notas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar MDF-e.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const resultado = await emitirMdfe(scope, await request.json());
    return NextResponse.json(resultado, { status: resultado.autorizado ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao emitir MDF-e.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
