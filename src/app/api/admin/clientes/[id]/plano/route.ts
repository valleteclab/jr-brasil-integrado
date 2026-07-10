import { NextResponse } from "next/server";
import { setTenantPlano, setTenantTrial, setTenantTrialAte, criarAssinaturaTenantAdmin, simularAtrasoMensalidade, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

/**
 * Define o plano/trial do cliente ou cria a assinatura. Body:
 *  - { plano? } troca o plano comercial (aplica preset de módulos)
 *  - { trialDias? } (null limpa) OU { trialAte?: "YYYY-MM-DD" } (null limpa) define o fim do teste
 *  - { acao: "criar-assinatura" } gera a mensalidade no Asaas e devolve o link da fatura
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as {
      plano?: "COMPLETO" | "EMISSOR"; trialDias?: number | null; trialAte?: string | null; acao?: string; dias?: number | null;
    };

    if (body.acao === "criar-assinatura") {
      const r = await criarAssinaturaTenantAdmin(params.id);
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.acao === "simular-atraso") {
      const r = await simularAtrasoMensalidade(params.id, body.dias === undefined ? 8 : body.dias);
      return NextResponse.json(r);
    }

    let plano: string | undefined;
    let trialFimEm: string | null | undefined;
    if (body.plano) {
      if (body.plano !== "COMPLETO" && body.plano !== "EMISSOR") {
        return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
      }
      plano = (await setTenantPlano(params.id, body.plano)).plano;
    }
    if (body.trialAte !== undefined) {
      const r = await setTenantTrialAte(params.id, body.trialAte);
      trialFimEm = r.trialFimEm?.toISOString() ?? null;
    } else if (body.trialDias !== undefined) {
      const r = await setTenantTrial(params.id, body.trialDias);
      trialFimEm = r.trialFimEm?.toISOString() ?? null;
    }
    return NextResponse.json({ ok: true, plano, trialFimEm });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao definir o plano.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
