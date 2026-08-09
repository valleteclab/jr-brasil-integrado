import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { importarLeadsProspeccao, SEGMENTOS_PROSPECCAO } from "@/lib/services/lead-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Importa leads da base de prospecção (dados abertos CNPJ) para o funil comercial. */
export async function POST(request: Request) {
  try {
    await requirePlatformAdmin();
    const body = (await request.json()) as {
      uf?: string; segmento?: string; cnaesLivres?: string[]; quantidade?: number;
      modoEmissor?: boolean; campanha?: string; presente?: string;
    };
    if (!body.uf?.trim()) return NextResponse.json({ error: "Informe a UF." }, { status: 400 });
    if (body.segmento && !SEGMENTOS_PROSPECCAO[body.segmento]) {
      return NextResponse.json({ error: "Segmento desconhecido." }, { status: 400 });
    }
    const resultado = await importarLeadsProspeccao({
      uf: body.uf,
      segmento: body.segmento ?? null,
      cnaesLivres: body.cnaesLivres ?? null,
      quantidade: body.quantidade ?? 20,
      modoEmissor: body.modoEmissor === true,
      campanha: body.campanha ?? null,
      presente: body.presente ?? null
    });
    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na importação de leads.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
