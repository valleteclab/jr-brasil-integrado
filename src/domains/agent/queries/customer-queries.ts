import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

/**
 * Busca de clientes para o agente (read-only, scope-first). Filtra por
 * tenant+empresa. Útil para montar orçamentos/pré-vendas (precisa do clienteId).
 */
export async function searchCustomers(
  scope: TenantScope,
  args: { termo?: string; limite?: number }
) {
  const termo = (args.termo ?? "").trim();
  const limite = Math.min(Math.max(args.limite ?? 10, 1), 30);

  const clientes = await prisma.cliente.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      ...(termo
        ? {
            OR: [
              { razaoSocial: { contains: termo, mode: "insensitive" } },
              { nomeFantasia: { contains: termo, mode: "insensitive" } },
              { documento: { contains: termo.replace(/\D/g, "") || termo } }
            ]
          }
        : {})
    },
    take: limite,
    orderBy: { razaoSocial: "asc" },
    select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true, status: true }
  });

  return clientes.map((c) => ({
    id: c.id,
    nome: c.nomeFantasia ?? c.razaoSocial,
    razaoSocial: c.razaoSocial,
    documento: c.documento,
    status: c.status
  }));
}
