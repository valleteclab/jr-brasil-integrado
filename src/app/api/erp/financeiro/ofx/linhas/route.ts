import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { linhasPendentes, listarImportacoes, resumoExtratoOfx } from "@/domains/finance/application/ofx-use-cases";

export const dynamic = "force-dynamic";

/** Linhas do extrato importado com os títulos sugeridos. Query: ?conta=&de=&ate=&todas=1 */
export async function GET(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const q = new URL(request.url).searchParams;
    const contaBancariaId = q.get("conta") || undefined;
    const de = q.get("de") ? new Date(q.get("de") as string) : undefined;
    const ate = q.get("ate") ? new Date(q.get("ate") as string) : undefined;
    const [linhas, resumo, importacoes] = await Promise.all([
      linhasPendentes(scope, { contaBancariaId, de, ate, incluirResolvidas: q.get("todas") === "1" }),
      resumoExtratoOfx(scope, contaBancariaId),
      listarImportacoes(scope, contaBancariaId)
    ]);
    return NextResponse.json({ linhas, resumo, importacoes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar o extrato.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}
