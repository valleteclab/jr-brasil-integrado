import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getWhatsappRuntime } from "@/lib/whatsapp/whatsapp-service";
import { zernioListarContas, zernioListarTemplates } from "@/lib/whatsapp/zernio-client";

/**
 * Descoberta para o setup da Zernio: lista as contas WhatsApp conectadas e (dado um accountId)
 * os templates aprovados da WABA — a tela usa para preencher os selects sem digitação manual.
 * Usa a API key JÁ SALVA (criptografada); não aceita key vinda do cliente.
 */
export async function GET(request: Request) {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const cfg = await getWhatsappRuntime(scope);
    if (!cfg?.token || cfg.provedor !== "ZERNIO") {
      return NextResponse.json({ error: "Salve a API key da Zernio primeiro (provedor Zernio)." }, { status: 400 });
    }
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId")?.trim() || cfg.zernioAccountId || "";

    const contas = await zernioListarContas(cfg.token);
    if (!contas.ok) {
      return NextResponse.json({ error: contas.error ?? "Não foi possível consultar a Zernio." }, { status: 400 });
    }
    const contasWhatsapp = contas.contas.filter((c) => c.platform.toLowerCase() === "whatsapp");

    let templates: Awaited<ReturnType<typeof zernioListarTemplates>>["templates"] = [];
    if (accountId) {
      const r = await zernioListarTemplates(cfg.token, accountId);
      if (r.ok) templates = r.templates;
    }

    return NextResponse.json({ contas: contasWhatsapp, templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consultar a Zernio.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
