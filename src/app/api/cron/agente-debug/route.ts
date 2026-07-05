import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * DIAGNÓSTICO do agente (read-only, CRON_SECRET): últimas conversas/mensagens de um canal
 * (TELEGRAM/WHATSAPP/WEB) e o estado da config de IA da empresa — para investigar quando o bot
 * fica em silêncio (o webhook absorve erros de propósito e o detalhe fica só no log).
 *
 *   curl -sS "https://erp.sisgov.app.br/api/cron/agente-debug?canal=TELEGRAM" \
 *        -H "x-cron-secret: <CRON_SECRET>"
 */
export const dynamic = "force-dynamic";

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("x-cron-secret")?.trim() === secret;
}

export async function GET(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const url = new URL(request.url);
    const canal = (url.searchParams.get("canal") ?? "TELEGRAM").toUpperCase();

    const conversas = await prisma.conversaAgente.findMany({
      where: { canal },
      orderBy: { atualizadoEm: "desc" },
      take: 3,
      select: {
        id: true, empresaId: true, role: true, telefone: true, atualizadoEm: true,
        mensagens: {
          orderBy: { criadoEm: "desc" },
          take: 10,
          select: { papel: true, conteudo: true, toolName: true, criadoEm: true }
        }
      }
    });

    // Estado da IA por empresa envolvida (sem expor segredos) — inclui o ultimoErro da OpenRouter.
    const empresas = [...new Set(conversas.map((c) => c.empresaId))];
    const ia = await Promise.all(empresas.map(async (empresaId) => {
      const cfg = await prisma.configuracaoIa.findFirst({
        where: { empresaId },
        select: { ativo: true, modelo: true, chaveCriptografada: true, ultimoErro: true, testadoEm: true }
      });
      const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { razaoSocial: true } });
      return {
        empresaId,
        empresa: empresa?.razaoSocial ?? null,
        iaAtiva: cfg?.ativo ?? null,
        modelo: cfg?.modelo ?? null,
        temChave: Boolean(cfg?.chaveCriptografada),
        ultimoErro: cfg?.ultimoErro ?? null,
        testadoEm: cfg?.testadoEm ?? null
      };
    }));

    return NextResponse.json({
      canal,
      conversas: conversas.map((c) => ({
        id: c.id,
        empresaId: c.empresaId,
        role: c.role,
        chave: c.telefone,
        atualizadoEm: c.atualizadoEm,
        mensagens: c.mensagens.map((m) => ({
          papel: m.papel,
          toolName: m.toolName,
          criadoEm: m.criadoEm,
          conteudo: (m.conteudo ?? "").slice(0, 400)
        }))
      })),
      ia
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no diagnóstico.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
