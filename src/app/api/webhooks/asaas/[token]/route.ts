import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { confirmarRecargaPorPagamento } from "@/domains/credito/application/carteira-use-cases";

/**
 * WEBHOOK do ASAAS (plano da plataforma): confirma o pagamento da recarga de créditos em tempo real
 * e credita a carteira do tenant. Segurança: o token na URL + o header `asaas-access-token` devem
 * bater com o webhookToken configurado. SEMPRE responde 200 (evita reentrega em loop).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { token: string } }) {
  try {
    const cfg = await prisma.plataformaCredito.findUnique({ where: { id: "default" }, select: { asaasWebhookToken: true } });
    const esperado = cfg?.asaasWebhookToken?.trim();
    const header = request.headers.get("asaas-access-token")?.trim();
    // Autentica por token na URL e/ou header (o Asaas envia o authToken no header).
    if (esperado && params.token !== esperado && header !== esperado) {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    const payload = (await request.json().catch(() => ({}))) as {
      event?: string;
      payment?: { id?: string; status?: string; subscription?: string | null };
    };
    const pago = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(payload.event ?? "");
    if (pago && payload.payment?.id) {
      // Mensalidade (pagamento de ASSINATURA): libera o tenant — limpa o trial.
      if (payload.payment.subscription) {
        const tenant = await prisma.tenant.findFirst({
          where: { assinaturaAsaasId: payload.payment.subscription },
          select: { id: true, trialFimEm: true }
        });
        if (tenant) {
          await prisma.tenant.update({ where: { id: tenant.id }, data: { trialFimEm: null } });
          console.info("[webhook asaas] mensalidade confirmada — tenant liberado:", tenant.id);
        }
      } else {
        // Recarga avulsa de créditos de consulta.
        await confirmarRecargaPorPagamento(payload.payment.id);
      }
    }
  } catch (error) {
    console.error("[webhook asaas]", error instanceof Error ? error.message : error);
  }
  return NextResponse.json({ received: true }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
