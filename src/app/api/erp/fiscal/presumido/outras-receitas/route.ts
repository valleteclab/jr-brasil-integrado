import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PresumidoError } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import { excluirOutraReceita, listarOutrasReceitas, salvarOutraReceita } from "@/domains/fiscal/presumido/fechamento-use-cases";

/** Receitas fora de nota fiscal do período. Query: ?ano=&mes= (mês opcional: sem ele, o ano todo). */
export async function GET(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const q = new URL(request.url).searchParams;
    const ano = Number(q.get("ano")) || new Date().getFullYear();
    const mes = Number(q.get("mes")) || 0;
    const inicio = new Date(Date.UTC(ano, mes ? mes - 1 : 0, 1));
    const fim = new Date(Date.UTC(mes ? ano : ano + 1, mes ? mes : 0, 1));
    return NextResponse.json({ receitas: await listarOutrasReceitas(scope, { inicio, fim }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar as receitas.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}

export async function POST(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as Record<string, unknown>;
    const receita = await salvarOutraReceita(scope, body, session?.usuarioId);
    return NextResponse.json({ receita });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar a receita.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PresumidoError ? 400 : 500) });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new PresumidoError("Informe a receita a excluir.");
    return NextResponse.json(await excluirOutraReceita(scope, id, session?.usuarioId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir a receita.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PresumidoError ? 400 : 500) });
  }
}
