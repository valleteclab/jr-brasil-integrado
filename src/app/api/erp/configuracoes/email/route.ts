import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { saveEmailConfig } from "@/lib/email/smtp-client";

// Config SMTP da empresa (sem expor a senha — só indicador de que existe).
export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const cfg = await prisma.configuracaoEmail.findUnique({ where: { empresaId: scope.empresaId } });
    return NextResponse.json({
      ativo: cfg?.ativo ?? false,
      host: cfg?.host ?? "",
      porta: cfg?.porta ?? 587,
      seguro: cfg?.seguro ?? false,
      usuario: cfg?.usuario ?? "",
      temSenha: Boolean(cfg?.senhaCripto),
      remetenteNome: cfg?.remetenteNome ?? "",
      remetenteEmail: cfg?.remetenteEmail ?? ""
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar config de e-mail.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    // Grava credenciais SMTP (segredo) — restrito a admin.
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as {
      ativo?: boolean;
      host?: string;
      porta?: number;
      seguro?: boolean;
      usuario?: string;
      senha?: string;
      remetenteNome?: string;
      remetenteEmail?: string;
    };
    await saveEmailConfig(scope, {
      ativo: Boolean(body.ativo),
      host: body.host,
      porta: body.porta,
      seguro: body.seguro,
      usuario: body.usuario,
      senha: body.senha,
      remetenteNome: body.remetenteNome,
      remetenteEmail: body.remetenteEmail
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar config de e-mail.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}
