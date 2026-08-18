import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { correspondeBusca } from "@/lib/search/normalize";

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

  // Busca ACENTO-insensivel: `contains` do banco nao casa "Luis" com "Luis" acentuado
  // (bug real: Camara Municipal de Luis Eduardo Magalhaes sumia da busca). Puxa os
  // candidatos do scope e filtra com correspondeBusca (mesma regra dos produtos).
  const candidatos = await prisma.cliente.findMany({
    where: scopedByTenantCompany(scope),
    take: 800,
    orderBy: { razaoSocial: "asc" },
    select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true, status: true }
  });
  const clientes = (termo
    ? candidatos.filter((c) => correspondeBusca(termo, c.razaoSocial, c.nomeFantasia, c.documento))
    : candidatos
  ).slice(0, limite);

  return clientes.map((c) => ({
    id: c.id,
    nome: c.nomeFantasia ?? c.razaoSocial,
    razaoSocial: c.razaoSocial,
    documento: c.documento,
    status: c.status
  }));
}
