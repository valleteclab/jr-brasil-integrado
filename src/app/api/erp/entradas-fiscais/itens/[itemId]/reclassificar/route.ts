import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, getSession } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import {
  reclassificarFinalidadeItem,
  simularReclassificacao,
  ReclassificacaoError
} from "@/domains/products/application/reclassificar-finalidade-use-cases";
import { isFinalidadeEntrada } from "@/domains/fiscal/finalidade-entrada";

/** Prévia do impacto (estoque e SPED) antes de confirmar. Não altera nada. */
export async function GET(request: Request, { params }: { params: { itemId: string } }) {
  try {
    await requireModulo("entradas-fiscais");
    const scope = await getDevelopmentTenantScope();
    const finalidade = new URL(request.url).searchParams.get("finalidade") ?? "";
    if (!isFinalidadeEntrada(finalidade)) {
      return NextResponse.json({ error: "Finalidade inválida." }, { status: 400 });
    }
    const impacto = await simularReclassificacao(scope, params.itemId, finalidade);
    return NextResponse.json({ impacto });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao simular a reclassificação.";
    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(error, error instanceof ReclassificacaoError ? 400 : 500) }
    );
  }
}

/** Aplica a nova finalidade, refazendo estoque, CFOP, crédito e CIAP. */
export async function PATCH(request: Request, { params }: { params: { itemId: string } }) {
  try {
    await requireModulo("entradas-fiscais");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { finalidade?: string; cfopEntrada?: string | null; motivo?: string | null };
    if (!isFinalidadeEntrada(body.finalidade ?? "")) {
      return NextResponse.json({ error: "Informe uma finalidade válida." }, { status: 400 });
    }
    const resultado = await reclassificarFinalidadeItem(
      scope,
      params.itemId,
      body.finalidade as Parameters<typeof reclassificarFinalidadeItem>[2],
      { cfopEntrada: body.cfopEntrada ?? null, motivo: body.motivo ?? null },
      session?.usuarioId
    );
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao reclassificar a finalidade.";
    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(error, error instanceof ReclassificacaoError ? 400 : 500) }
    );
  }
}
