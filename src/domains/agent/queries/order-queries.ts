import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

/**
 * Situação de um pedido de venda pelo número (ex.: "PV-000003"). Read-only,
 * scope-first — nunca busca só por id/numero sem o escopo tenant+empresa.
 */
export async function getOrderStatus(scope: TenantScope, args: { numero?: string }) {
  const numero = (args.numero ?? "").trim();
  if (!numero) return { encontrado: false, motivo: "Informe o número do pedido." };

  const pedido = await prisma.pedidoVenda.findFirst({
    where: { ...scopedByTenantCompany(scope), numero },
    select: {
      id: true,
      numero: true,
      status: true,
      total: true,
      criadoEm: true,
      confirmadoEm: true,
      faturadoEm: true,
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
      notasFiscais: { select: { modelo: true, numero: true, status: true, chaveAcesso: true } },
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
      modelo: n.modelo,
      numero: n.numero,
      status: n.status,
      chaveAcesso: n.chaveAcesso ?? null
    }))
  };
}
