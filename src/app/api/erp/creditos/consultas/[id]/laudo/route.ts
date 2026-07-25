import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { CreditoError } from "@/domains/credito/application/carteira-use-cases";
import { gerarLaudoCreditoPdf } from "@/domains/credito/application/laudo-credito";

export const dynamic = "force-dynamic";

/** Laudo PRÓPRIO da consulta de crédito em PDF (gerado do resultado guardado — sem novo custo). */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("financeiro");
    const scope = await getDevelopmentTenantScope();
    const { pdf, nomeArquivo } = await gerarLaudoCreditoPdf(scope, params.id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nomeArquivo}"`
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao gerar o laudo.";
    return NextResponse.json({ error: msg }, { status: authErrorStatus(error, error instanceof CreditoError ? 400 : 500) });
  }
}
