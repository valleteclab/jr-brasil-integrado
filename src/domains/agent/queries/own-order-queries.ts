import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";

/**
 * Pedidos do PRÓPRIO cliente (autoatendimento). Read-only, scope-first E sempre
 * filtrado por clienteId — o cliente final só enxerga os próprios pedidos.
 */
export async function listOwnOrders(scope: TenantScope, clienteId: string, limite = 10) {
  if (!clienteId) return [];
  const pedidos = await prisma.pedidoVenda.findMany({
    where: { ...scopedByTenantCompanyAmbiente(scope), clienteId },
    orderBy: { criadoEm: "desc" },
    take: Math.min(Math.max(limite, 1), 20),
    select: {
      numero: true,
      status: true,
      total: true,
      criadoEm: true,
      notasFiscais: { select: { modelo: true, numero: true, status: true } }
    }
  });
  return pedidos.map((p) => ({
    numero: p.numero,
    status: p.status,
    total: Number(p.total),
    criadoEm: p.criadoEm.toISOString(),
    notas: p.notasFiscais.map((n) => ({ modelo: n.modelo, numero: n.numero, status: n.status }))
  }));
}
