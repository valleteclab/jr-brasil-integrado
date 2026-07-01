import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { BoletoError, configurarSicoob } from "@/domains/finance/application/boleto-use-cases";

/** Configura a cobrança Sicoob da conta bancária (client_id, nº do beneficiário, sandbox). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const body = await request.json() as {
      sicoobClientId?: string | null;
      sicoobNumeroCliente?: number | null;
      sicoobContaCorrente?: string | null;
      sicoobModalidade?: number;
      sicoobSandbox?: boolean;
      sicoobSandboxToken?: string | null;
    };
    await configurarSicoob(scope, params.id, {
      ...(body.sicoobClientId !== undefined ? { sicoobClientId: body.sicoobClientId } : {}),
      ...(body.sicoobNumeroCliente !== undefined ? { sicoobNumeroCliente: body.sicoobNumeroCliente ? Number(body.sicoobNumeroCliente) : null } : {}),
      ...(body.sicoobContaCorrente !== undefined ? { sicoobContaCorrente: body.sicoobContaCorrente } : {}),
      ...(body.sicoobModalidade !== undefined ? { sicoobModalidade: Number(body.sicoobModalidade) || 1 } : {}),
      ...(body.sicoobSandbox !== undefined ? { sicoobSandbox: Boolean(body.sicoobSandbox) } : {}),
      ...(body.sicoobSandboxToken !== undefined ? { sicoobSandboxToken: body.sicoobSandboxToken } : {})
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar a configuração Sicoob.";
    const status = authErrorStatus(error, error instanceof BoletoError ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}
