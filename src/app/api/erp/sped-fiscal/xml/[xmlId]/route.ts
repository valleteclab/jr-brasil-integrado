import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import { excluirSpedXmlDocumento, SpedError } from "@/domains/fiscal/application/sped-use-cases";

// Remove um XML avulso do SPED (ele deixa de entrar nas próximas gerações).
export async function DELETE(_request: Request, { params }: { params: { xmlId: string } }) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const r = await excluirSpedXmlDocumento(scope, params.xmlId, session.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir o XML.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    if (error instanceof SpedError) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
