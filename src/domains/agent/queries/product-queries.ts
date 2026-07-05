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

  // Busca por TOKENS: cada palavra/pedaço do termo precisa aparecer em algum campo — assim
  // "boleto-teste" acha o SKU "TESTE-BOLETO" e "cruzeta spicer" acha por nome+marca do código.
  const tokens = termo.split(/[^a-zA-Z0-9]+/).filter((t) => t.length >= 2);
  const camposDoToken = (t: string) => ({
    OR: [
      { sku: { contains: t, mode: "insensitive" as const } },
      { nome: { contains: t, mode: "insensitive" as const } },
      { codigoOriginal: { contains: t, mode: "insensitive" as const } },
      { codigoFabricante: { contains: t, mode: "insensitive" as const } },
      { gtin: { contains: t, mode: "insensitive" as const } }
    ]
  });

  const produtos = await prisma.produto.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      ativo: true,
      ...(tokens.length ? { AND: tokens.map(camposDoToken) } : {})
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
