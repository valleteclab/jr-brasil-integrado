import { NextResponse } from "next/server";
import { BoletoError, processarWebhookCobranca } from "@/domains/finance/application/boleto-use-cases";

/**
 * WEBHOOK público chamado pelo SICOOB quando um boleto liquida (baixa em tempo real).
 * Segurança: o segredo aleatório na URL identifica a conta; o corpo NUNCA é confiado —
 * o processamento re-consulta a API do Sicoob antes de baixar qualquer título.
 */
export async function POST(request: Request, { params }: { params: { segredo: string } }) {
  try {
    const payload = await request.json().catch(() => ({}));
    const r = await processarWebhookCobranca(params.segredo, payload);
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    if (error instanceof BoletoError) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
    // 200 evita desativação do webhook por falha transitória nossa; o cron cobre o que faltar.
    console.error("[webhook sicoob cobranca]", error);
    return NextResponse.json({ ok: false });
  }
}

/** Ping de validação do cadastro (o Sicoob checa se a URL responde). */
export async function GET() {
  return NextResponse.json({ ok: true });
}
