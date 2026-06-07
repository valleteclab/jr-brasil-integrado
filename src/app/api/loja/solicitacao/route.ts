import { NextResponse } from "next/server";
import { getLojaScope } from "@/lib/services/loja";
import { criarSolicitacaoLoja, SolicitacaoLojaError } from "@/domains/sales/application/loja-use-cases";
import type { SolicitacaoLojaInput } from "@/domains/sales/application/loja-use-cases";

// Rota PÚBLICA (cliente final, sem login do ERP). Recebe um pedido ou solicitação de orçamento
// montado na loja e o registra no ERP (canal "LOJA") para o lojista concluir.
export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<SolicitacaoLojaInput> & { slug?: string };

    const slug = (body.slug ?? "").trim();
    if (!slug) {
      return NextResponse.json({ error: "Loja não identificada." }, { status: 400 });
    }
    const tipo = body.tipo === "ORCAMENTO" ? "ORCAMENTO" : "PEDIDO";
    const itens = (body.itens ?? [])
      .filter((i) => i && i.produtoId && Number(i.quantidade) > 0)
      .map((i) => ({ produtoId: i.produtoId, quantidade: Number(i.quantidade), precoUnitario: Number(i.precoUnitario) || 0 }));

    if (!itens.length) {
      return NextResponse.json({ error: "Inclua ao menos um produto." }, { status: 400 });
    }
    if (!body.cliente?.nome || !body.cliente?.documento) {
      return NextResponse.json({ error: "Informe nome e CPF/CNPJ." }, { status: 400 });
    }

    const scope = await getLojaScope(slug);
    const result = await criarSolicitacaoLoja(scope, { tipo, cliente: body.cliente, itens, observacoes: body.observacoes });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível enviar a solicitação.";
    const status = error instanceof SolicitacaoLojaError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
