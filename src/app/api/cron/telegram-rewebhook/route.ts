import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { saveTelegramConfig } from "@/lib/telegram/telegram-service";

/**
 * Re-registra o webhook do Telegram de TODAS as empresas ativas (CRON_SECRET) — necessário quando
 * os allowed_updates mudam (ex.: inclusão de callback_query para os botões dos fluxos guiados),
 * pois o Telegram só aplica a mudança num novo setWebhook.
 *
 *   curl -sS -X POST "https://erp.sisgov.app.br/api/cron/telegram-rewebhook" -H "x-cron-secret: <CRON_SECRET>"
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("x-cron-secret")?.trim() !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim() || "";
    if (!host) return NextResponse.json({ error: "Host público indeterminado." }, { status: 400 });
    const baseUrl = `${proto}://${host}`;

    const configs = await prisma.configuracaoTelegram.findMany({
      where: { ativo: true },
      select: { tenantId: true, empresaId: true, atenderClientes: true }
    });
    const resultados: Array<{ empresaId: string; ok: boolean; erro?: string }> = [];
    for (const cfg of configs) {
      try {
        // Reaproveita o fluxo oficial de salvar (getMe + setWebhook com secret novo).
        await saveTelegramConfig(
          { tenantId: cfg.tenantId, empresaId: cfg.empresaId },
          { ativo: true, atenderClientes: cfg.atenderClientes },
          baseUrl
        );
        resultados.push({ empresaId: cfg.empresaId, ok: true });
      } catch (e) {
        resultados.push({ empresaId: cfg.empresaId, ok: false, erro: e instanceof Error ? e.message : "falha" });
      }
    }
    return NextResponse.json({ reRegistrados: resultados.filter((r) => r.ok).length, resultados });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha." }, { status: 400 });
  }
}
