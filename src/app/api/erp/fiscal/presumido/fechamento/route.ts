import { NextResponse } from "next/server";
import type { TipoApuracaoFiscal } from "@prisma/client";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PresumidoError, apuracaoPresumido } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import { apuracaoPisCofins } from "@/domains/fiscal/presumido/pis-cofins-use-cases";
import { fecharApuracao, reabrirApuracao } from "@/domains/fiscal/presumido/fechamento-use-cases";

/**
 * Fecha o período (guardando o snapshot do que foi apurado) ou reabre.
 * O snapshot é recalculado AQUI, no servidor — nunca vem do cliente.
 */
export async function POST(request: Request) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as { tipo?: string; ano?: number; periodo?: number; observacao?: string; reabrir?: boolean; motivo?: string };
    const tipo = (body.tipo === "PIS_COFINS" ? "PIS_COFINS" : "IRPJ_CSLL") as TipoApuracaoFiscal;
    const ano = Number(body.ano);
    const periodo = Number(body.periodo);
    if (!ano || !periodo) throw new PresumidoError("Informe ano e período.");

    if (body.reabrir) {
      const r = await reabrirApuracao(scope, { tipo, ano, periodo, motivo: body.motivo ?? null }, session?.usuarioId);
      return NextResponse.json(r);
    }

    const snapshot =
      tipo === "PIS_COFINS"
        ? await apuracaoPisCofins(scope, { ano, mes: periodo })
        : await apuracaoPresumido(scope, { ano, trimestre: periodo });

    const r = await fecharApuracao(
      scope,
      { tipo, ano, periodo, snapshot, totalRecolher: snapshot.totais.totalRecolher, observacao: body.observacao ?? null },
      session?.usuarioId
    );
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao fechar a apuração.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PresumidoError ? 400 : 500) });
  }
}
