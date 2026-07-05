import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { saveTelegramConfig } from "@/lib/telegram/telegram-service";

// Config do bot do Telegram da empresa — sem expor o token, só indicadores.
export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const cfg = await prisma.configuracaoTelegram.findUnique({ where: { empresaId: scope.empresaId } });
    const vinculos = cfg
      ? await prisma.telegramVinculo.count({ where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true } })
      : 0;
    return NextResponse.json({
      ativo: cfg?.ativo ?? false,
      temToken: Boolean(cfg?.botTokenCripto),
      botUsername: cfg?.botUsername ?? "",
      atenderClientes: cfg?.atenderClientes ?? true,
      vinculos
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar config do Telegram.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    // Grava o token do bot — restrito a admin (como o WhatsApp).
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { ativo?: boolean; atenderClientes?: boolean; botToken?: string };
    // URL PÚBLICA para o setWebhook. Atrás do Traefik o request.url é o endereço interno
    // (porta 3000, que o Telegram rejeita) — a URL real vem dos headers x-forwarded-* do proxy.
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
      || request.headers.get("host")?.trim()
      || new URL(request.url).host;
    const baseUrl = `${proto}://${host}`;
    const r = await saveTelegramConfig(
      scope,
      { ativo: Boolean(body.ativo), atenderClientes: body.atenderClientes ?? true, botToken: body.botToken ?? null },
      baseUrl
    );
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar config do Telegram.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
