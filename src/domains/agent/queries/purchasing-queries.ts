import type { Prisma, StatusPedidoCompra } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

const STATUS: StatusPedidoCompra[] = ["RASCUNHO", "ENVIADO", "PARCIAL", "RECEBIDO", "CANCELADO"];

export async function listSuppliersForAgent(
  scope: TenantScope,
  input: { busca?: string; somenteAtivos?: boolean; limite?: number }
) {
  const busca = input.busca?.trim();
  const documento = busca?.replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  const limite = Math.min(Math.max(Number(input.limite) || 20, 1), 50);
  const where: Prisma.FornecedorWhereInput = {
    ...scopedByTenantCompany(scope),
    ...(input.somenteAtivos === false ? {} : { ativo: true }),
    ...(busca
      ? {
          OR: [
            { razaoSocial: { contains: busca, mode: "insensitive" } },
            { nomeFantasia: { contains: busca, mode: "insensitive" } },
            ...(documento ? [{ documento: { contains: documento } }] : [])
          ]
        }
      : {})
  };
  const [totalEncontrado, fornecedores] = await prisma.$transaction([
    prisma.fornecedor.count({ where }),
    prisma.fornecedor.findMany({
      where,
      orderBy: [{ ativo: "desc" }, { razaoSocial: "asc" }],
      take: limite,
      select: {
        id: true,
        razaoSocial: true,
        nomeFantasia: true,
        documento: true,
        email: true,
        telefone: true,
        cidade: true,
        uf: true,
        condicaoPagamento: true,
        ativo: true
      }
    })
  ]);
  return {
    totalEncontrado,
    exibidos: fornecedores.length,
    fornecedores: fornecedores.map((f) => ({
      fornecedorId: f.id,
      nome: f.nomeFantasia ?? f.razaoSocial,
      razaoSocial: f.razaoSocial,
      documento: f.documento,
      email: f.email,
      telefone: f.telefone,
      cidade: f.cidade,
      uf: f.uf,
      condicaoPagamento: f.condicaoPagamento,
      ativo: f.ativo
    }))
  };
}

export async function listPurchaseOrdersForAgent(
  scope: TenantScope,
  input: { numero?: string; fornecedor?: string; status?: string; limite?: number }
) {
  const numero = input.numero?.trim();
  const fornecedor = input.fornecedor?.trim();
  const status = STATUS.includes(input.status as StatusPedidoCompra) ? (input.status as StatusPedidoCompra) : undefined;
  const limite = Math.min(Math.max(Number(input.limite) || 20, 1), 50);
  const where: Prisma.PedidoCompraWhereInput = {
    ...scopedByTenantCompany(scope),
    ...(numero ? { numero: { contains: numero, mode: "insensitive" } } : {}),
    ...(status ? { status } : {}),
    ...(fornecedor
      ? {
          fornecedor: {
            OR: [
              { razaoSocial: { contains: fornecedor, mode: "insensitive" } },
              { nomeFantasia: { contains: fornecedor, mode: "insensitive" } }
            ]
          }
        }
      : {})
  };
  const [totalEncontrado, pedidos] = await prisma.$transaction([
    prisma.pedidoCompra.count({ where }),
    prisma.pedidoCompra.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: limite,
      select: {
        id: true,
        numero: true,
        status: true,
        previsaoEm: true,
        condicaoPagamento: true,
        subtotal: true,
        frete: true,
        total: true,
        criadoEm: true,
        fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        itens: {
          select: {
            quantidade: true,
            quantidadeRecebida: true,
            custoUnitario: true,
            total: true,
            produto: { select: { sku: true, nome: true } }
          }
        }
      }
    })
  ]);
  return {
    totalEncontrado,
    exibidos: pedidos.length,
    pedidos: pedidos.map((pedido) => ({
      pedidoCompraId: pedido.id,
      numero: pedido.numero,
      status: pedido.status,
      fornecedorId: pedido.fornecedor.id,
      fornecedor: pedido.fornecedor.nomeFantasia ?? pedido.fornecedor.razaoSocial,
      previsaoEm: pedido.previsaoEm?.toISOString().slice(0, 10) ?? null,
      condicaoPagamento: pedido.condicaoPagamento,
      subtotal: Number(pedido.subtotal),
      frete: Number(pedido.frete),
      total: Number(pedido.total),
      criadoEm: pedido.criadoEm.toISOString(),
      itens: numero
        ? pedido.itens.map((item) => ({
            sku: item.produto.sku,
            produto: item.produto.nome,
            quantidade: item.quantidade,
            quantidadeRecebida: Number(item.quantidadeRecebida),
            custoUnitario: Number(item.custoUnitario),
            total: Number(item.total)
          }))
        : undefined
    }))
  };
}
