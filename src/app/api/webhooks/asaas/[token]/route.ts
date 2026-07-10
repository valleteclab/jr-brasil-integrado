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
      payment?: { id?: string; status?: string; subscription?: string | null; dueDate?: string | null; invoiceUrl?: string | null };
    };
    const evento = payload.event ?? "";
    const pago = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(evento);
    // Fatura de assinatura vencida / removida → marca (ou limpa) a inadimplência da mensalidade.
    const atrasada = ["PAYMENT_OVERDUE"].includes(evento);
    const cancelada = ["PAYMENT_DELETED", "PAYMENT_REFUNDED"].includes(evento);

    if (pago && payload.payment?.id) {
      // Mensalidade (pagamento de ASSINATURA): libera o tenant — limpa o trial e a inadimplência.
      if (payload.payment.subscription) {
        const tenant = await prisma.tenant.findFirst({
          where: { assinaturaAsaasId: payload.payment.subscription },
          select: { id: true }
        });
        if (tenant) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { trialFimEm: null, mensalidadeVencidaEm: null, mensalidadeFaturaUrl: null }
          });
          console.info("[webhook asaas] mensalidade confirmada — tenant liberado:", tenant.id);
        }
      } else {
        // Recarga avulsa de créditos de consulta.
        await confirmarRecargaPorPagamento(payload.payment.id);
      }
    } else if (atrasada && payload.payment?.subscription) {
      // Mensalidade venceu sem pagamento: guarda o vencimento + link da fatura. O aviso (≥3 dias)
      // e o bloqueio (≥7 dias) são derivados ao vivo a partir desta data no shell/layout.
      const tenant = await prisma.tenant.findFirst({
        where: { assinaturaAsaasId: payload.payment.subscription },
        select: { id: true, mensalidadeVencidaEm: true }
      });
      if (tenant) {
        const vencimento = payload.payment.dueDate ? new Date(`${payload.payment.dueDate}T12:00:00`) : new Date();
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            // Mantém o vencimento MAIS ANTIGO em aberto (não empurra o prazo a cada nova fatura).
            mensalidadeVencidaEm: tenant.mensalidadeVencidaEm ?? vencimento,
            mensalidadeFaturaUrl: payload.payment.invoiceUrl ?? undefined
          }
        });
        console.info("[webhook asaas] mensalidade em atraso — tenant:", tenant.id);
      }
    } else if (cancelada && payload.payment?.subscription) {
      // Fatura removida/estornada: limpa a inadimplência (nova fatura reabrirá se for o caso).
      const tenant = await prisma.tenant.findFirst({
        where: { assinaturaAsaasId: payload.payment.subscription },
        select: { id: true }
      });
      if (tenant) {
        await prisma.tenant.update({ where: { id: tenant.id }, data: { mensalidadeVencidaEm: null, mensalidadeFaturaUrl: null } });
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
