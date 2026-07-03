import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, requireAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { saveWhatsappConfig } from "@/lib/whatsapp/whatsapp-service";

// Config WhatsApp da empresa (Z-API ou Zernio) — sem expor segredos, só indicadores.
export async function GET() {
  try {
    await requireModulo("configuracoes");
    const scope = await getDevelopmentTenantScope();
    const cfg = await prisma.configuracaoWhatsapp.findUnique({ where: { empresaId: scope.empresaId } });
    return NextResponse.json({
      ativo: cfg?.ativo ?? false,
      provedor: cfg?.provedor ?? "ZAPI",
      instanceId: cfg?.instanceId ?? "",
      temToken: Boolean(cfg?.tokenCripto),
      temClientToken: Boolean(cfg?.clientTokenCripto),
      atenderClientes: cfg?.atenderClientes ?? true,
      zernioAccountId: cfg?.zernioAccountId ?? "",
      zernioTemplateNome: cfg?.zernioTemplateNome ?? "",
      zernioTemplateIdioma: cfg?.zernioTemplateIdioma ?? "pt_BR"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar config do WhatsApp.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    // Grava segredos (token Z-API ou API key Zernio) — restrito a admin.
    await requireAdmin();
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as {
      ativo?: boolean;
      provedor?: string;
      instanceId?: string;
      token?: string;
      clientToken?: string;
      atenderClientes?: boolean;
      zernioApiKey?: string;
      zernioAccountId?: string;
      zernioTemplateNome?: string;
      zernioTemplateIdioma?: string;
    };
    await saveWhatsappConfig(scope, {
      ativo: Boolean(body.ativo),
      provedor: body.provedor === "ZERNIO" ? "ZERNIO" : "ZAPI",
      instanceId: body.instanceId,
      token: body.token,
      clientToken: body.clientToken,
      atenderClientes: body.atenderClientes ?? true,
      zernioApiKey: body.zernioApiKey,
      zernioAccountId: body.zernioAccountId,
      zernioTemplateNome: body.zernioTemplateNome,
      zernioTemplateIdioma: body.zernioTemplateIdioma
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar config do WhatsApp.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}
