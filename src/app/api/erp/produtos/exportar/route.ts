import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireModulo } from "@/lib/auth/session";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { authErrorStatus } from "@/lib/auth/http";

export const dynamic = "force-dynamic";

function esc(value: string | null | undefined): string {
  const v = value ?? "";
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
const dec = (v: { toString(): string } | null | undefined) => (v == null ? "" : Number(v.toString()).toFixed(4).replace(/\.?0+$/, "").replace(".", ","));

/**
 * Exportação COMPLETA do cadastro de produtos da empresa (sem paginação) em CSV para Excel
 * pt-BR (UTF-8 com BOM, separador ;). ?ativos=1 exporta só os ativos.
 */
export async function GET(request: Request) {
  try {
    await requireModulo("produtos");
    const scope = await getDevelopmentTenantScope();
    const soAtivos = new URL(request.url).searchParams.get("ativos") === "1";
    const produtos = await prisma.produto.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ...(soAtivos ? { ativo: true } : {}) },
      orderBy: { nome: "asc" },
      select: {
        sku: true, nome: true, ativo: true, unidade: true, ncm: true, cest: true, origem: true, gtin: true,
        codigoOriginal: true, codigoFabricante: true, precoVenda: true, precoVendaPrazo: true, precoMinimo: true,
        custoMedio: true, ultimoCusto: true, quantidadeMinima: true, criadoEm: true,
        categoria: { select: { nome: true } }, marca: { select: { nome: true } },
        saldosEstoque: { select: { quantidade: true } }
      }
    });
    const cab = ["SKU", "Produto", "Ativo", "Unid.", "NCM", "CEST", "Origem", "GTIN", "Cód. original", "Cód. fabricante",
      "Preço venda", "Preço prazo", "Preço mínimo", "Custo médio", "Último custo", "Qtd. mínima", "Categoria", "Marca", "Estoque", "Cadastrado em"];
    const linhas = produtos.map((p) => [
      esc(p.sku), esc(p.nome), p.ativo ? "Sim" : "Não", esc(p.unidade), esc(p.ncm), esc(p.cest), esc(p.origem), esc(p.gtin),
      esc(p.codigoOriginal), esc(p.codigoFabricante), dec(p.precoVenda), dec(p.precoVendaPrazo), dec(p.precoMinimo),
      dec(p.custoMedio), dec(p.ultimoCusto), String(p.quantidadeMinima), esc(p.categoria?.nome), esc(p.marca?.nome),
      dec(p.saldosEstoque.reduce((s, x) => s + Number(x.quantidade.toString()), 0)),
      p.criadoEm.toLocaleDateString("pt-BR")
    ].join(";"));
    const csv = "\uFEFF" + [cab.join(";"), ...linhas].join("\r\n");
    const data = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="produtos-${data}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao exportar produtos.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}
