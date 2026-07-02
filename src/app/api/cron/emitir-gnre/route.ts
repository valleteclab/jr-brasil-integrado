import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import type { TenantScope } from "@/lib/auth/dev-session";
import { GuiaError, emitirGuiaGnre } from "@/domains/fiscal/application/guia-use-cases";

/**
 * Rota de OPERAÇÃO (CRON_SECRET, como os crons): emite no webservice GNRE a guia pendente
 * informada — ou a mais recente pendente da empresa. Body: { empresa: <cnpj|nome>, guiaId? }.
 * Só guias de nota em HOMOLOGAÇÃO ou com o CNPJ habilitado no Portal GNRE processam.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("x-cron-secret")?.trim() === secret;
}

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const body = (await request.json()) as { empresa?: string; guiaId?: string };
    const cnpj = (body.empresa ?? "").replace(/\D+/g, "");
    const empresa = await prisma.empresa.findFirst({
      where: cnpj.length === 14 ? { cnpj } : { razaoSocial: { contains: body.empresa ?? "", mode: "insensitive" } }
    });
    if (!empresa) throw new GuiaError(`Empresa não encontrada: ${body.empresa}`);
    const scope = { tenantId: empresa.tenantId, empresaId: empresa.id, ambiente: "HOMOLOGACAO" } as TenantScope;

    const guia = body.guiaId
      ? await prisma.guiaRecolhimento.findFirst({ where: { id: body.guiaId, ...scopedByTenantCompany(scope) } })
      : await prisma.guiaRecolhimento.findFirst({
          where: { ...scopedByTenantCompany(scope), status: "PENDENTE" },
          orderBy: { criadoEm: "desc" }
        });
    if (!guia) throw new GuiaError("Nenhuma guia pendente encontrada.");

    const r = await emitirGuiaGnre(scope, guia.id);
    return NextResponse.json({
      guiaId: r.id,
      situacaoWs: r.situacaoWs,
      linhaDigitavel: r.linhaDigitavel,
      codigoBarras: r.codigoBarras,
      temPdf: Boolean(r.pdfBase64),
      pdfBytes: r.pdfBase64 ? Buffer.from(r.pdfBase64, "base64").length : 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao emitir a GNRE.";
    return NextResponse.json({ error: message }, { status: error instanceof GuiaError ? 400 : 500 });
  }
}
