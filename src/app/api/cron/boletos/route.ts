import { NextResponse } from "next/server";
import { sincronizarBoletosCron } from "@/domains/finance/application/boleto-use-cases";
import { sincronizarPixCron } from "@/domains/finance/application/pix-use-cases";
import { rodarAlertasEmissor, notificarMensalidadeAtraso } from "@/domains/fiscal/application/emissor-alertas-use-cases";
import { monitorarReforma } from "@/domains/fiscal/application/reforma-monitor-use-cases";
import { gerarOcorrenciasRecorrentes } from "@/domains/finance/application/recorrencia-use-cases";

// Disparado pelo crontab da VPS (mesmo esquema do /api/cron/distribuicao): consulta os boletos
// registrados E as cobranças Pix ativas no Sicoob, baixando automaticamente os títulos pagos
// (crédito na conta bancária). O webhook cobre o tempo real; este cron é a rede de segurança.
// Protegido pelo segredo compartilhado (CRON_SECRET) no header `x-cron-secret` ou query `?secret=`.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret")?.trim();
  const query = new URL(request.url).searchParams.get("secret")?.trim();
  return header === secret || query === secret;
}

async function handle(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const result = await sincronizarBoletosCron();
    const pix = await sincronizarPixCron().catch((e) => ({ pendentes: 0, pagos: 0, erros: [e instanceof Error ? e.message : String(e)] }));
    // Alertas do plano Emissor (idempotentes — deduplicam por janela; pega carona neste cron).
    const alertas = await rodarAlertasEmissor().catch((e) => ({ tenants: 0, notificacoes: 0, erro: e instanceof Error ? e.message : String(e) }));
    // Aviso de mensalidade em atraso pelo sino (≥3 dias; dedupe diário).
    const mensalidade = await notificarMensalidadeAtraso().catch((e) => ({ tenants: 0, notificacoes: 0, erro: e instanceof Error ? e.message : String(e) }));
    // Despesas recorrentes (folha, aluguel...): materializa as competências devidas (idempotente).
    const recorrentes = await gerarOcorrenciasRecorrentes().catch((e) => ({ geradas: 0, erros: [e instanceof Error ? e.message : String(e)] }));
    // Monitor da Reforma Tributária (fontes oficiais + prontidão) — throttle interno de 1×/dia.
    const reforma = await monitorarReforma().catch((e) => ({ pulado: true, erro: e instanceof Error ? e.message : String(e) }));
    return NextResponse.json({ ok: true, ...result, pix, recorrentes, alertas, mensalidade, reforma });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronização de boletos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
