import { NextResponse } from "next/server";
import { PixError, processarWebhookPix } from "@/domains/finance/application/pix-use-cases";

/**
 * WEBHOOK público chamado pelo SICOOB quando um Pix é recebido na chave da conta (tempo real —
 * é o que faz o caixa/PDV confirmar o pagamento na hora, sem esperar o cron).
 * Segurança: o segredo aleatório na URL identifica a conta; o corpo NUNCA é confiado —
 * o processamento re-consulta a cobrança na API do banco antes de confirmar/baixar.
 */
export async function POST(request: Request, { params }: { params: { segredo: string } }) {
  try {
    const payload = await request.json().catch(() => ({}));
    const r = await processarWebhookPix(params.segredo, payload);
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    if (error instanceof PixError) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
    // 200 evita desativação do webhook por falha transitória nossa; o cron cobre o que faltar.
    console.error("[webhook sicoob pix]", error);
    return NextResponse.json({ ok: false });
  }
}

/** Ping de validação do cadastro (o Sicoob checa se a URL responde). */
export async function GET() {
  return NextResponse.json({ ok: true });
}
