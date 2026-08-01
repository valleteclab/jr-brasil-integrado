import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * Importa o HISTÓRICO DE VENDAS do sistema anterior (VendaMigrada — read-only, fora do
 * operacional). CSV flat no corpo (1 linha por item; campos do pedido repetidos):
 *   numero;tipo;dataPed;codParceiro;parceiro;total;itemCodigo;itemDescricao;itemPreco;itemQtd;itemDesconto;itemTotal
 * De/Para: cliente por codigoExterno (codParceiro); produto por SKU exato ou sem zeros à esquerda.
 * Idempotente por (tenant, empresa, numero) — re-rodar substitui o pedido e seus itens.
 * Protegida por CRON_SECRET; ?cnpj= resolve a empresa; ?dry=1 só relata.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 800;

function num(v: string): number {
  const n = Number((v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function dataBr(v: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((v ?? "").trim());
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`) : null;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("x-cron-secret")?.trim() !== secret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const dry = url.searchParams.get("dry") === "1";
    const cnpjParam = normalizeDocumento(url.searchParams.get("cnpj") ?? "");
    const empresas = await prisma.empresa.findMany({ select: { id: true, tenantId: true, cnpj: true, razaoSocial: true } });
    const empresa = empresas.find((e) => normalizeDocumento(e.cnpj) === cnpjParam);
    if (!empresa) return NextResponse.json({ error: "Empresa não encontrada pelo CNPJ." }, { status: 404 });
    const scope = { tenantId: empresa.tenantId, empresaId: empresa.id };

    const rows = (await request.text()).split(/\r?\n/).filter((l) => l.trim());
    const header = rows.shift()?.split(";") ?? [];
    const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
    type Item = { codigo: string; descricao: string; preco: number; qtd: number; desconto: number; total: number };
    type Pedido = { numero: string; tipo: string; data: Date | null; codParceiro: string; parceiro: string; total: number; itens: Item[] };
    const pedidos = new Map<string, Pedido>();
    for (const raw of rows) {
      const c = raw.split(";");
      const g = (nome: string) => (c[idx[nome]] ?? "").trim();
      const numero = g("numero");
      if (!numero) continue;
      if (!pedidos.has(numero)) {
        pedidos.set(numero, {
          numero, tipo: g("tipo"), data: dataBr(g("dataPed")), codParceiro: g("codParceiro"),
          parceiro: g("parceiro"), total: num(g("total")), itens: []
        });
      }
      pedidos.get(numero)!.itens.push({
        codigo: g("itemCodigo"), descricao: g("itemDescricao"), preco: num(g("itemPreco")),
        qtd: num(g("itemQtd")) || 1, desconto: num(g("itemDesconto")), total: num(g("itemTotal"))
      });
    }

    // De/Para de clientes (codigoExterno) e produtos (sku).
    const clientes = await prisma.cliente.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, codigoExterno: { not: null } },
      select: { id: true, codigoExterno: true }
    });
    const porCodigo = new Map(clientes.map((cl) => [cl.codigoExterno as string, cl.id]));
    const produtos = await prisma.produto.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
      select: { id: true, sku: true }
    });
    const porSku = new Map<string, string>();
    for (const p of produtos) {
      porSku.set(p.sku, p.id);
      porSku.set(p.sku.replace(/^0+/, ""), p.id);
    }

    const lista = [...pedidos.values()];
    const semCliente = lista.filter((p) => !porCodigo.has(p.codParceiro)).length;
    const totalItens = lista.reduce((s, p) => s + p.itens.length, 0);
    const itensSemProduto = lista.reduce(
      (s, p) => s + p.itens.filter((i) => !porSku.has(i.codigo) && !porSku.has(i.codigo.replace(/^0+/, ""))).length, 0);

    if (dry) {
      return NextResponse.json({
        dry: true, empresa: empresa.razaoSocial, pedidos: lista.length, itens: totalItens,
        pedidosSemClienteNoDePara: semCliente, itensSemProdutoNoDePara: itensSemProduto
      });
    }

    let gravados = 0;
    for (const p of lista) {
      const clienteId = porCodigo.get(p.codParceiro) ?? null;
      const existente = await prisma.vendaMigrada.findUnique({
        where: { tenantId_empresaId_numero: { tenantId: scope.tenantId, empresaId: scope.empresaId, numero: p.numero } }
      });
      if (existente) {
        await prisma.vendaMigradaItem.deleteMany({ where: { vendaMigradaId: existente.id } });
        await prisma.vendaMigrada.delete({ where: { id: existente.id } });
      }
      await prisma.vendaMigrada.create({
        data: {
          ...scope, numero: p.numero, tipo: p.tipo, data: p.data, codigoParceiro: p.codParceiro,
          parceiroNome: p.parceiro, clienteId, total: p.total,
          itens: {
            create: p.itens.map((i) => ({
              tenantId: scope.tenantId, empresaId: scope.empresaId,
              codigo: i.codigo, descricao: i.descricao,
              produtoId: porSku.get(i.codigo) ?? porSku.get(i.codigo.replace(/^0+/, "")) ?? null,
              preco: i.preco, quantidade: i.qtd, desconto: i.desconto, total: i.total
            }))
          }
        }
      });
      gravados++;
    }
    return NextResponse.json({
      empresa: empresa.razaoSocial, pedidos: gravados, itens: totalItens,
      pedidosSemClienteNoDePara: semCliente, itensSemProdutoNoDePara: itensSemProduto
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro na importação." }, { status: 500 });
  }
}
