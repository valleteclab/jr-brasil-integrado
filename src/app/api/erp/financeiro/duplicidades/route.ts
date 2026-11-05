import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, getSession } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { listarDespesasDuplicadas, mesclarDespesasDuplicadas } from "@/domains/finance/application/buscar-duplicidade-use-cases";

/** Pares de contas a pagar que parecem a mesma despesa lançada duas vezes. */
export async function GET() {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const pares = await listarDespesasDuplicadas(scope);
    return NextResponse.json({ pares });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao procurar duplicidades.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

/** Mescla o par: move os vínculos para a conta que fica e apaga a duplicada. */
export async function POST(request: Request) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { manterId?: string; removerId?: string };
    if (!body.manterId || !body.removerId) {
      return NextResponse.json({ error: "Informe as duas contas." }, { status: 400 });
    }
    const r = await mesclarDespesasDuplicadas(scope, body.manterId, body.removerId, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao mesclar as despesas.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
