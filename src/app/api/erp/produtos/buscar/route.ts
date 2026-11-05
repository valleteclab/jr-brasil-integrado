import { NextResponse } from "next/server";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";

/**
 * Busca de produtos para vincular o item da nota de entrada.
 *
 * Existe porque a tela carregava TODOS os produtos ativos de uma vez e filtrava no navegador:
 * com milhares de itens, cada tecla refazia a conta e a lista travava. Aqui o banco faz o
 * trabalho e devolve no máximo 30 — o suficiente para escolher.
 *
 * Devolve também unidade e saldo, que é o que distingue dois produtos de nome parecido.
 */
export async function GET(request: Request) {
  try {
    await requireModulo("entradas-fiscais");
    const scope = await getDevelopmentTenantScope();
    const url = new URL(request.url);
    const termo = (url.searchParams.get("q") ?? "").trim();

    // Cada palavra precisa aparecer em SKU, nome, marca ou código de barras: digitar
    // "mini pc" acha "PC MINI GAMER" sem exigir a ordem exata.
    const palavras = termo.split(/\s+/).filter((p) => p.length >= 2).slice(0, 5);

    const produtos = await prisma.produto.findMany({
      where: {
        ...scopedByTenantCompany(scope),
        ativo: true,
        ...(palavras.length
          ? {
              AND: palavras.map((p) => ({
                OR: [
                  { nome: { contains: p, mode: "insensitive" as const } },
                  { sku: { contains: p, mode: "insensitive" as const } },
                  { gtin: { contains: p, mode: "insensitive" as const } },
                  // Marca é relação (ProdutoMarca), não texto no produto.
                  { marca: { nome: { contains: p, mode: "insensitive" as const } } }
                ]
              }))
            }
          : {})
      },
      select: { id: true, sku: true, nome: true, unidade: true, gtin: true, marca: { select: { nome: true } } },
      orderBy: [{ nome: "asc" }],
      take: 30
    });

    // Saldo em uma consulta só (sem N+1): ajuda a reconhecer o produto certo.
    const saldos = produtos.length
      ? await prisma.estoqueSaldo.groupBy({
          by: ["produtoId"],
          where: { ...scopedByTenantCompany(scope), produtoId: { in: produtos.map((p) => p.id) } },
          _sum: { quantidade: true }
        })
      : [];
    const saldoPorProduto = new Map(saldos.map((s) => [s.produtoId, Number(s._sum.quantidade ?? 0)]));

    return NextResponse.json({
      produtos: produtos.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.nome,
        unidade: p.unidade,
        marca: p.marca?.nome ?? null,
        gtin: p.gtin,
        saldo: saldoPorProduto.get(p.id) ?? 0
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao buscar produtos.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
