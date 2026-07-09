import { NextResponse } from "next/server";
import { setTenantPlano, setTenantTrial, PlatformAdminError } from "@/lib/services/platform-admin";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

/** Define o plano comercial e/ou o trial do cliente. Body: { plano? , trialDias? (null limpa) }. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as { plano?: "COMPLETO" | "EMISSOR"; trialDias?: number | null };
    let plano: string | undefined;
    let trialFimEm: string | null | undefined;
    if (body.plano) {
      if (body.plano !== "COMPLETO" && body.plano !== "EMISSOR") {
        return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
      }
      plano = (await setTenantPlano(params.id, body.plano)).plano;
    }
    if (body.trialDias !== undefined) {
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
