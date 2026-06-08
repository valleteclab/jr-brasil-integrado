import { NextResponse } from "next/server";
import { resolveEmpresaScope, PlatformAdminError } from "@/lib/services/platform-admin";
import { emitirNotaTesteHomologacao, StandaloneEmissionError } from "@/domains/fiscal/application/standalone-emission-use-cases";
import type { ModeloTesteFiscal } from "@/domains/fiscal/application/standalone-emission-use-cases";
import { SessionError, ForbiddenError } from "@/lib/auth/session";

// Dono do SaaS emite uma nota de teste (NF-e/NFC-e/NFS-e) em homologação para validar a config.
export async function POST(request: Request, { params }: { params: { id: string; empresaId: string } }) {
  try {
    const scope = await resolveEmpresaScope(params.id, params.empresaId);
    const body = (await request.json().catch(() => ({}))) as { modelo?: ModeloTesteFiscal };
    const modelo: ModeloTesteFiscal = body.modelo === "NFCE" || body.modelo === "NFSE" ? body.modelo : "NFE";
    const nota = await emitirNotaTesteHomologacao(scope, modelo);
    return NextResponse.json({ status: nota.status, numero: nota.numero ?? null, motivo: nota.motivo ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao emitir a nota de teste.";
    const status =
      error instanceof SessionError ? 401
      : error instanceof ForbiddenError ? 403
      : error instanceof PlatformAdminError || error instanceof StandaloneEmissionError ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
