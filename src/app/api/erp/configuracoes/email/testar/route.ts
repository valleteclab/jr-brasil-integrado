import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { authErrorStatus } from "@/lib/auth/http";
import { getEmailRuntime, sendEmail } from "@/lib/email/smtp-client";

/** Envia um e-mail de TESTE com a config SMTP salva (valida host/porta/senha de app). */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const { destino } = (await request.json().catch(() => ({}))) as { destino?: string };

    const cfg = await getEmailRuntime(scope);
    if (!cfg) return NextResponse.json({ error: "Configure e salve o SMTP antes de testar." }, { status: 400 });
    const to = destino?.trim() || cfg.remetenteEmail || cfg.usuario || "";
    if (!to) return NextResponse.json({ error: "Informe um e-mail de destino para o teste." }, { status: 400 });

    const r = await sendEmail(cfg, {
      to,
      subject: "✅ Teste de e-mail — XERP",
      html: `<p>Este é um e-mail de <strong>teste</strong> enviado pelo XERP.</p>
             <p>Se você está lendo isto, a configuração SMTP está funcionando:
             servidor <code>${cfg.host}</code>, porta <code>${cfg.porta}</code>,
             remetente <code>${cfg.remetenteEmail || cfg.usuario}</code>.</p>`
    });
    if (!r.ok) return NextResponse.json({ error: r.error || "Falha no envio." }, { status: 400 });
    return NextResponse.json({ ok: true, para: to });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro no teste de e-mail." }, { status: authErrorStatus(error, 500) });
  }
}
