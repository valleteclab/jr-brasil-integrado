import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { Prisma, StatusPedido } from "@prisma/client";
import { scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { normalizeDocumento } from "@/lib/fiscal/documento";

const STATUS_PEDIDO: StatusPedido[] = [
  "RASCUNHO",
  "AGUARDANDO_PAGAMENTO",
  "AGUARDANDO_NOTA",
  "SEPARACAO",
  "ENVIADO",
  "ENTREGUE",
  "CANCELADO"
];

/**
 * Situação de um pedido de venda pelo número (ex.: "PV-000003"). Read-only,
 * scope-first — nunca busca só por id/numero sem o escopo tenant+empresa.
 */
export async function getOrderStatus(scope: TenantScope, args: { numero?: string }) {
  const numero = (args.numero ?? "").trim();
  if (!numero) return { encontrado: false, motivo: "Informe o número do pedido." };

  const pedido = await prisma.pedidoVenda.findFirst({
    where: { ...scopedByTenantCompanyAmbiente(scope), numero },
    select: {
      id: true,
      numero: true,
      status: true,
      total: true,
      criadoEm: true,
      confirmadoEm: true,
      faturadoEm: true,
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
      notasFiscais: { select: { id: true, modelo: true, numero: true, numeroNfse: true, status: true, chaveAcesso: true } },
      itens: { select: { id: true } }
    }
  });
  if (!pedido) return { encontrado: false, motivo: "Pedido não encontrado." };

  return {
    encontrado: true,
    numero: pedido.numero,
    status: pedido.status,
    cliente: pedido.cliente ? (pedido.cliente.nomeFantasia ?? pedido.cliente.razaoSocial) : "Consumidor não identificado",
    total: Number(pedido.total),
    qtdItens: pedido.itens.length,
    criadoEm: pedido.criadoEm.toISOString(),
    confirmadoEm: pedido.confirmadoEm?.toISOString() ?? null,
    faturadoEm: pedido.faturadoEm?.toISOString() ?? null,
    notas: pedido.notasFiscais.map((n) => ({
      notaId: n.id,
      modelo: n.modelo,
      numero: n.numeroNfse ?? n.numero,
      status: n.status,
      chaveAcesso: n.chaveAcesso ?? null
    }))
  };
}

export async function listRecentOrders(
  scope: TenantScope,
  input: { cliente?: string; status?: string; periodoDias?: number; limite?: number }
) {
  const cliente = input.cliente?.trim();
  const documento = normalizeDocumento(cliente);
  const status = STATUS_PEDIDO.includes(input.status as StatusPedido) ? (input.status as StatusPedido) : undefined;
  const periodoDias = Number(input.periodoDias);
  const limite = Math.min(Math.max(Number(input.limite) || 20, 1), 50);
  const criadoDepoisDe =
    Number.isFinite(periodoDias) && periodoDias > 0
      ? new Date(Date.now() - Math.min(periodoDias, 3650) * 24 * 60 * 60 * 1000)
      : undefined;

  const where: Prisma.PedidoVendaWhereInput = {
    ...scopedByTenantCompanyAmbiente(scope),
    ...(status ? { status } : {}),
    ...(criadoDepoisDe ? { criadoEm: { gte: criadoDepoisDe } } : {}),
    ...(cliente
      ? {
          cliente: {
            OR: [
              { razaoSocial: { contains: cliente, mode: "insensitive" } },
              { nomeFantasia: { contains: cliente, mode: "insensitive" } },
              ...(documento ? [{ documento: { contains: documento } }] : [])
            ]
          }
        }
      : {})
  };

  const [totalEncontrado, pedidos] = await prisma.$transaction([
    prisma.pedidoVenda.count({ where }),
    prisma.pedidoVenda.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: limite,
      select: {
        id: true,
        numero: true,
        status: true,
        canal: true,
        total: true,
        criadoEm: true,
        confirmadoEm: true,
        faturadoEm: true,
        cliente: { select: { razaoSocial: true, nomeFantasia: true } },
        notasFiscais: {
          select: { id: true, modelo: true, numero: true, numeroNfse: true, status: true }
        },
        _count: { select: { itens: true } }
      }
    })
  ]);

  return {
    totalEncontrado,
    exibidos: pedidos.length,
    limite,
    pedidos: pedidos.map((pedido) => ({
      pedidoId: pedido.id,
      numero: pedido.numero,
      status: pedido.status,
      canal: pedido.canal,
      cliente: pedido.cliente ? (pedido.cliente.nomeFantasia ?? pedido.cliente.razaoSocial) : "Consumidor não identificado",
      total: Number(pedido.total),
      qtdItens: pedido._count.itens,
      criadoEm: pedido.criadoEm.toISOString(),
      confirmadoEm: pedido.confirmadoEm?.toISOString() ?? null,
      faturadoEm: pedido.faturadoEm?.toISOString() ?? null,
      notas: pedido.notasFiscais.map((nota) => ({
        notaId: nota.id,
        modelo: nota.modelo,
        numero: nota.numeroNfse ?? nota.numero ?? "-",
        status: nota.status
      }))
    }))
  };
}
