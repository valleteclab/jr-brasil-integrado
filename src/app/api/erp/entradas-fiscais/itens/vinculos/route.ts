import { NextResponse } from "next/server";
import { updateFiscalEntryItemLinks } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { isFinalidadeEntrada } from "@/domains/fiscal/finalidade-entrada";
import {
  produtosAfetadosPelaCorrecao,
  recalcularNcmDosProdutos
} from "@/domains/products/application/vinculo-divergente-use-cases";

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

    // Na correção que cria produto novo, os produtos que perdem itens são descobertos ANTES de
    // aplicar — depois a memória fornecedor+código já aponta para o produto novo e não dá mais
    // para saber de onde o item saiu.
    const idsCriandoProduto = links.filter((l) => l.correcaoFiscal && l.criarNovoSku).map((l) => l.itemId);
    const afetados = await produtosAfetadosPelaCorrecao(scope, idsCriandoProduto);

    const result = await updateFiscalEntryItemLinks(scope, links);

    // Os itens saíram do produto errado; agora o produto volta a ter o NCM dos itens que
    // realmente são dele. Só roda numa correção, para não mexer em cadastro sem querer.
    const paraRecalcular = Array.from(new Set([...(body.recalcularNcmDe ?? []), ...afetados]));
    const ncmCorrigidos = paraRecalcular.length ? await recalcularNcmDosProdutos(scope, paraRecalcular) : [];

    return NextResponse.json({ ...result, ncmCorrigidos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar os vínculos dos itens.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
