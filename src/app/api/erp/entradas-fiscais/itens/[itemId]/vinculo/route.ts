import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { updateFiscalEntryItemLink } from "@/domains/products/application/fiscal-entry-use-cases";

type RouteContext = {
  params: {
    itemId: string;
  };
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const body = await request.json() as {
      produtoId?: string | null;
      criarNovoSku?: boolean;
      precoVenda?: number | null;
      precoMinimo?: number | null;
      marca?: string | null;
    };
    const scope = await getDevelopmentTenantScope();
    const item = await updateFiscalEntryItemLink(scope, context.params.itemId, {
      produtoId: body.produtoId,
      criarNovoSku: Boolean(body.criarNovoSku),
      precoVenda: body.precoVenda,
      precoMinimo: body.precoMinimo,
      marca: body.marca
    });

    return NextResponse.json({ id: item.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar o vínculo do item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
