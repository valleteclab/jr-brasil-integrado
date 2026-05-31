import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { saveWhatsappConfig } from "@/lib/whatsapp/zapi-client";

// Config Z-API da empresa (sem expor token/clientToken — só indicadores).
export async function GET() {
  try {
    const scope = await getDevelopmentTenantScope();
    const cfg = await prisma.configuracaoWhatsapp.findUnique({ where: { empresaId: scope.empresaId } });
    return NextResponse.json({
      ativo: cfg?.ativo ?? false,
      instanceId: cfg?.instanceId ?? "",
      temToken: Boolean(cfg?.tokenCripto),
      temClientToken: Boolean(cfg?.clientTokenCripto),
      atenderClientes: cfg?.atenderClientes ?? true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar config do WhatsApp.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as {
      ativo?: boolean;
      instanceId?: string;
      token?: string;
      clientToken?: string;
      atenderClientes?: boolean;
    };
    await saveWhatsappConfig(scope, {
      ativo: Boolean(body.ativo),
      instanceId: body.instanceId,
      token: body.token,
      clientToken: body.clientToken,
      atenderClientes: body.atenderClientes ?? true
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar config do WhatsApp.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
