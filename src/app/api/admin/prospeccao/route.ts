import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { getProspeccaoStatus, enviarTesteProspeccao, runProspeccaoAtiva } from "@/domains/platform-sales/runtime/prospeccao-ativa";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    await requirePlatformAdmin();
    return NextResponse.json(await getProspeccaoStatus());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

export async function PUT(request: Request) {
  try {
    await requirePlatformAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const int = (v: unknown, min: number, max: number, def: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : def;
    };
    const txt = (v: unknown, def: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 2000) : def);
    const atual = await getProspeccaoStatus();
    const data = {
      ativo: body.ativo === true,
      limiteDia: int(body.limiteDia, 1, 300, atual.config.limiteDia),
      porExecucao: int(body.porExecucao, 1, 10, atual.config.porExecucao),
      horaInicio: int(body.horaInicio, 0, 23, atual.config.horaInicio),
      horaFim: int(body.horaFim, 1, 24, atual.config.horaFim),
      somenteDiasUteis: body.somenteDiasUteis !== false,
      maxToques: int(body.maxToques, 1, 3, atual.config.maxToques),
      diasEntreToques: int(body.diasEntreToques, 1, 14, atual.config.diasEntreToques),
      toque1: txt(body.toque1, atual.config.toque1),
      toque2: txt(body.toque2, atual.config.toque2),
      toque3: txt(body.toque3, atual.config.toque3)
    };
    await prisma.plataformaProspeccaoConfig.update({ where: { id: "default" }, data });
    return NextResponse.json(await getProspeccaoStatus());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}

/** POST: ação — {acao:"teste", telefone} envia o toque 1 de exemplo; {acao:"rodar"} executa um ciclo agora. */
export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
    const body = (await request.json()) as { acao?: string; telefone?: string };
    if (body.acao === "teste") {
      if (!body.telefone?.trim()) return NextResponse.json({ error: "Informe o telefone do teste." }, { status: 400 });
      return NextResponse.json(await enviarTesteProspeccao(body.telefone));
    }
    if (body.acao === "rodar") {
      return NextResponse.json(await runProspeccaoAtiva());
    }
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na ação.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
