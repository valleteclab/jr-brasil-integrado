import { NextResponse } from "next/server";
import { SessionError, ForbiddenError } from "@/lib/auth/session";
import { listarCobrancasAdmin, emitirNfseMensalidadeAdmin, enviarCobrancaEmailAdmin, vincularNotaFaturaAdmin, PlatformAdminError } from "@/lib/services/platform-admin";

/** Cobranças da plataforma: GET = clientes + faturas (Asaas); POST = emitir NFS-e da mensalidade. */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function statusFor(error: unknown): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PlatformAdminError) return 400;
  return 500;
}

export async function GET() {
  try {
    return NextResponse.json({ cobrancas: await listarCobrancasAdmin() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      acao?: string; tenantId?: string; valor?: number | null; descricao?: string | null; codigoServicoLc116?: string | null;
      para?: string; fatura?: { valor: number; vencimento: string | null; link: string | null } | null; notaId?: string | null;
      faturaAsaasId?: string | null;
    };
    if (!body.tenantId) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });

    if (body.acao === "vincular-nota") {
      if (!body.faturaAsaasId || !body.notaId) return NextResponse.json({ error: "Informe a fatura e a NFS-e." }, { status: 400 });
      return NextResponse.json(await vincularNotaFaturaAdmin(body.tenantId, body.faturaAsaasId, body.notaId));
    }
    if (body.acao === "enviar-email") {
      const r = await enviarCobrancaEmailAdmin(body.tenantId, {
        para: body.para ?? "",
        fatura: body.fatura ?? null,
        notaId: body.notaId ?? null
      });
      return NextResponse.json(r);
    }

    const r = await emitirNfseMensalidadeAdmin(body.tenantId, {
      valor: body.valor ?? null,
      descricao: body.descricao ?? null,
      codigoServicoLc116: body.codigoServicoLc116 ?? null,
      faturaAsaasId: body.faturaAsaasId ?? null
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: statusFor(error) });
  }
}
