import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { buildOutboundXmlPackage } from "@/lib/services/accounting-xml-package";

function paramsFromUrl(request: Request): { mes?: number; ano?: number } {
  const url = new URL(request.url);
  const mes = Number(url.searchParams.get("mes"));
  const ano = Number(url.searchParams.get("ano"));
  return { mes: Number.isFinite(mes) ? mes : undefined, ano: Number.isFinite(ano) ? ano : undefined };
}

// ZIP com os XMLs das notas de saída (NF-e/NFC-e/NFS-e) do mês, para o contador.
export async function GET(request: Request) {
  try {
    await requireModulo("relatorios");
    const pkg = await buildOutboundXmlPackage(paramsFromUrl(request));
    return new NextResponse(new Uint8Array(pkg.zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pkg.filename}"`,
        "X-Total-Notas": String(pkg.total),
        "X-XML-Incluidos": String(pkg.incluidos),
        "X-XML-Faltando": String(pkg.faltando)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar o pacote de XMLs.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}
