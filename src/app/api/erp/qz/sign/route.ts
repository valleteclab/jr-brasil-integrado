import { NextResponse } from "next/server";
import { createSign } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/security/secret-crypto";

/**
 * Assina (server-side) a string que o QZ Tray pede a cada impressão, com a chave privada da
 * plataforma (RSA-SHA512). A chave NUNCA sai do servidor. Devolve a assinatura em base64.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.scope) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    const { request: toSign } = (await request.json()) as { request?: string };
    if (!toSign) return NextResponse.json({ error: "Nada para assinar." }, { status: 400 });

    const cfg = await prisma.plataformaConfiguracao.findUnique({ where: { id: "default" }, select: { qzChaveCripto: true } });
    if (!cfg?.qzChaveCripto) return NextResponse.json({ error: "Assinatura do QZ não configurada." }, { status: 400 });

    const privateKey = decryptSecret(cfg.qzChaveCripto);
    const signature = createSign("RSA-SHA512").update(toSign).sign(privateKey, "base64");
    return NextResponse.json({ signature });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro." }, { status: 500 });
  }
}
