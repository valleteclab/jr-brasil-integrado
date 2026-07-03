import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { SimplesError, salvarConfigSimples } from "@/domains/fiscal/simples/apuracao-simples-use-cases";

/** Config do Simples da empresa: anexo (1–5) e folha mensal média (Fator R). */
export async function POST(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { anexo?: number | null; anexoServicos?: number | null; folhaMensal?: number | null };
    const r = await salvarConfigSimples(scope, {
      anexo: body.anexo != null ? Number(body.anexo) : null,
      anexoServicos: body.anexoServicos != null ? Number(body.anexoServicos) : null,
      folhaMensal: body.folhaMensal != null && body.folhaMensal !== 0 ? Number(body.folhaMensal) : null
    }, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar a configuração.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof SimplesError ? 400 : 500) });
  }
}
