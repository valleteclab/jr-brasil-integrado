import { NextResponse } from "next/server";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";

/** PDF da GNRE emitida pelo webservice (guardado na guia). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("fiscal");
    const scope = await getDevelopmentTenantScope();
    const guia = await prisma.guiaRecolhimento.findFirst({
      where: { id: params.id, ...scopedByTenantCompany(scope) },
      select: { pdfBase64: true, ufFavorecida: true, notaFiscal: { select: { numero: true } } }
    });
    if (!guia?.pdfBase64) return NextResponse.json({ error: "PDF da guia não disponível — emita a GNRE primeiro." }, { status: 404 });
    return new NextResponse(Buffer.from(guia.pdfBase64, "base64"), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="gnre-${guia.ufFavorecida}-nfe-${guia.notaFiscal.numero ?? "s-n"}.pdf"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar o PDF da guia.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}
