import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { GuiaError, emitirGuiaGnre } from "@/domains/fiscal/application/guia-use-cases";
import { GnreError } from "@/domains/fiscal/providers/gnre/gnre-ws";

export const maxDuration = 120;

/** Emite a guia no webservice GNRE (linha digitável + PDF salvos na guia). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const g = await emitirGuiaGnre(scope, params.id, session?.usuarioId);
    return NextResponse.json({ situacaoWs: g.situacaoWs, linhaDigitavel: g.linhaDigitavel, temPdf: Boolean(g.pdfBase64) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao emitir a GNRE.";
    const badRequest = error instanceof GuiaError || error instanceof GnreError;
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, badRequest ? 400 : 500) });
  }
}
