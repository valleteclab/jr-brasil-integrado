import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, SessionError, ForbiddenError } from "@/lib/auth/session";
import { analisarSpedComIa, SpedError } from "@/domains/fiscal/application/sped-use-cases";

// Auditoria da apuração pela IA (OpenRouter). Respeita os gates: módulo SPED do tenant,
// módulo de IA do tenant (iaHabilitada) e configuração de IA da empresa.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulo("sped-fiscal");
    const scope = await getDevelopmentTenantScope();
    const analise = await analisarSpedComIa(scope, params.id, session.usuarioId);
    return NextResponse.json(analise);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao analisar o SPED com IA.";
    if (error instanceof SessionError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: message }, { status: 403 });
    if (error instanceof SpedError) return NextResponse.json({ error: message }, { status: 400 });
    // Erros da IA (chave/limite/modelo) viram 400 para a UI exibir a mensagem.
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
