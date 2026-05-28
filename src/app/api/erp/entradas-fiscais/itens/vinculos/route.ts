import { NextResponse } from "next/server";
import { updateFiscalEntryItemLinks } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export async function PUT(request: Request) {
  try {
    const body = await request.json() as {
      links?: Array<{
        itemId?: string;
        produtoId?: string | null;
        criarNovoSku?: boolean;
        precoVenda?: number | null;
        precoMinimo?: number | null;
        marca?: string | null;
      }>;
    };

    const links = body.links?.filter((link) => link.itemId).map((link) => ({
      itemId: link.itemId!,
      produtoId: link.produtoId,
      criarNovoSku: Boolean(link.criarNovoSku),
      precoVenda: link.precoVenda,
      precoMinimo: link.precoMinimo,
      marca: link.marca
    })) ?? [];

    if (!links.length) {
      return NextResponse.json({ updated: 0 });
    }

    const scope = await getDevelopmentTenantScope();
    const result = await updateFiscalEntryItemLinks(scope, links);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar os vínculos dos itens.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
