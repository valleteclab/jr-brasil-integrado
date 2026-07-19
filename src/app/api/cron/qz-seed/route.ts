import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { encryptSecret } from "@/lib/security/secret-crypto";

/**
 * Semeia o par de chaves de ASSINATURA do QZ Tray (impressão direta no PDV) na plataforma.
 * Protegido por CRON_SECRET (mesmo esquema dos demais /api/cron). Recebe o certificado público (PEM)
 * e a chave privada (PEM) — guarda o certificado em claro e a chave criptografada. Idempotente.
 */
export const dynamic = "force-dynamic";

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret")?.trim();
  const query = new URL(request.url).searchParams.get("secret")?.trim();
  return header === secret || query === secret;
}

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const body = (await request.json()) as { cert?: string; privateKey?: string };
    const cert = (body.cert ?? "").trim();
    const key = (body.privateKey ?? "").trim();
    if (!cert.includes("BEGIN CERTIFICATE") || !key.includes("PRIVATE KEY")) {
      return NextResponse.json({ error: "Informe cert (PEM) e privateKey (PEM) válidos." }, { status: 400 });
    }
    await prisma.plataformaConfiguracao.upsert({
      where: { id: "default" },
      create: { id: "default", qzCertificado: cert, qzChaveCripto: encryptSecret(key) },
      update: { qzCertificado: cert, qzChaveCripto: encryptSecret(key) }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: 500 });
  }
}
