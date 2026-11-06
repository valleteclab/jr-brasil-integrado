import { NextResponse } from "next/server";
import { updateFiscalEntryItemLinks } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { isFinalidadeEntrada } from "@/domains/fiscal/finalidade-entrada";
import { recalcularNcmDosProdutos } from "@/domains/products/application/vinculo-divergente-use-cases";

export async function PUT(request: Request) {
  try {
    await requireModulo("entradas-fiscais");
    const body = await request.json() as {
      links?: Array<{
        itemId?: string;
        produtoId?: string | null;
        criarNovoSku?: boolean;
        nome?: string | null;
        precoVenda?: number | null;
        precoVendaPrazo?: number | null;
        precoMinimo?: number | null;
        marca?: string | null;
        finalidade?: string | null;
        cfopEntrada?: string | null;
        fatorConversao?: number | null;
        unidadeVenda?: string | null;
        correcaoFiscal?: boolean;
      }>;
      /** Produtos cujo NCM deve ser recalculado depois da correção (ver use-case). */
      recalcularNcmDe?: string[];
    };

    const links = body.links?.filter((link) => link.itemId).map((link) => ({
      itemId: link.itemId!,
      produtoId: link.produtoId,
      criarNovoSku: Boolean(link.criarNovoSku),
      nome: link.nome?.trim() || null,
      precoVenda: link.precoVenda,
      precoVendaPrazo: link.precoVendaPrazo,
      precoMinimo: link.precoMinimo,
      marca: link.marca,
      finalidade: isFinalidadeEntrada(link.finalidade) ? link.finalidade : null,
      cfopEntrada: link.cfopEntrada ?? null,
      fatorConversao: typeof link.fatorConversao === "number" && link.fatorConversao > 0 ? link.fatorConversao : null,
      unidadeVenda: link.unidadeVenda?.trim() || null,
      correcaoFiscal: Boolean(link.correcaoFiscal)
    })) ?? [];

    if (!links.length) {
      return NextResponse.json({ updated: 0 });
    }

    const scope = await getDevelopmentTenantScope();
    const result = await updateFiscalEntryItemLinks(scope, links);

    // Os itens saíram do produto errado; agora o produto volta a ter o NCM dos itens que
    // realmente são dele. Só roda quando o chamador pede, para não mexer em cadastro sem querer.
    const ncmCorrigidos = body.recalcularNcmDe?.length
      ? await recalcularNcmDosProdutos(scope, body.recalcularNcmDe)
      : [];

    return NextResponse.json({ ...result, ncmCorrigidos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar os vínculos dos itens.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
