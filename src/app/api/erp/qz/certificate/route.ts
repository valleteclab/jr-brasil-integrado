import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

/** Certificado público (PEM) usado pelo QZ Tray para identificar o site e assinar as impressões. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.scope) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const cfg = await prisma.plataformaConfiguracao.findUnique({ where: { id: "default" }, select: { qzCertificado: true } });
    return new NextResponse(cfg?.qzCertificado ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: 500 });
  }
}
