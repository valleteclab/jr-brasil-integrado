import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

/**
 * Busca de produtos para o agente (read-only, scope-first). Filtra sempre por
 * tenant+empresa (SECURITY_MULTI_TENANCY). Retorna campos comerciais essenciais.
 */
export async function searchProducts(
  scope: TenantScope,
  args: { termo?: string; limite?: number }
) {
  const termo = (args.termo ?? "").trim();
  const limite = Math.min(Math.max(args.limite ?? 10, 1), 30);

  const produtos = await prisma.produto.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      ativo: true,
      ...(termo
        ? {
            OR: [
              { sku: { contains: termo, mode: "insensitive" } },
              { nome: { contains: termo, mode: "insensitive" } },
              { codigoOriginal: { contains: termo, mode: "insensitive" } },
              { gtin: { contains: termo, mode: "insensitive" } }
            ]
          }
        : {})
    },
    take: limite,
    orderBy: { nome: "asc" },
    select: { id: true, sku: true, nome: true, unidade: true, precoVenda: true, ncm: true }
  });

  return produtos.map((p) => ({
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    unidade: p.unidade,
    precoVenda: Number(p.precoVenda),
    ncm: p.ncm ?? null
  }));
}
