import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { abrirCaixa, CaixaError } from "@/domains/cashier/application/cashier-use-cases";

export async function POST(request: Request) {
  try {
    // O operador é SEMPRE o usuário logado (nome + id da sessão) — o cliente não envia o nome,
    // evitando abrir o caixa em nome de outra pessoa.
    const user = await requireModulo("caixa");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { saldoInicial?: number; observacao?: string };
    const caixa = await abrirCaixa(scope, {
      operador: user.nome,
      operadorUsuarioId: user.usuarioId,
      saldoInicial: body.saldoInicial,
      observacao: body.observacao
    });
    return NextResponse.json({ id: caixa.id, status: caixa.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao abrir o caixa.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof CaixaError ? 400 : 500) });
  }
}
