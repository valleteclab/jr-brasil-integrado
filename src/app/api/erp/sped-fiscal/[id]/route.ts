import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireAdmin, requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import { excluirSpedArquivo, SpedError } from "@/domains/fiscal/application/sped-use-cases";

// EXCLUIR um arquivo SPED gerado (o .txt é apenas um espelho dos dados; pode ser regerado).
// Restrito a ADMIN do cliente.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const r = await excluirSpedArquivo(scope, params.id, session.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir o arquivo SPED.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    if (error instanceof SpedError) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
