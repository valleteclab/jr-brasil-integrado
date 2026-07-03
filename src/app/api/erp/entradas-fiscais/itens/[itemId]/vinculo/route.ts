import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { updateFiscalEntryItemLink } from "@/domains/products/application/fiscal-entry-use-cases";
import { isFinalidadeEntrada } from "@/domains/fiscal/finalidade-entrada";

type RouteContext = {
  params: {
    itemId: string;
  };
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireModulo("entradas-fiscais");
    const body = await request.json() as {
      produtoId?: string | null;
      criarNovoSku?: boolean;
      precoVenda?: number | null;
      precoVendaPrazo?: number | null;
      precoMinimo?: number | null;
      marca?: string | null;
      finalidade?: string | null;
      cfopEntrada?: string | null;
    };
    const scope = await getDevelopmentTenantScope();
    const item = await updateFiscalEntryItemLink(scope, context.params.itemId, {
      produtoId: body.produtoId,
      criarNovoSku: Boolean(body.criarNovoSku),
      precoVenda: body.precoVenda,
      precoVendaPrazo: body.precoVendaPrazo,
      precoMinimo: body.precoMinimo,
      marca: body.marca,
      finalidade: isFinalidadeEntrada(body.finalidade) ? body.finalidade : null,
      cfopEntrada: body.cfopEntrada ?? null
    });

    return NextResponse.json({ id: item.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o vínculo do item.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
