import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

/**
 * Saldo de estoque de um produto (por SKU ou id), somando os depósitos da empresa.
 * Read-only, scope-first. Disponível = quantidade − reservado.
 */
export async function getStockBalance(
  scope: TenantScope,
  args: { sku?: string; produtoId?: string }
) {
  const sku = (args.sku ?? "").trim();
  const produtoId = (args.produtoId ?? "").trim();
  if (!sku && !produtoId) {
    return { encontrado: false, motivo: "Informe o SKU ou o id do produto." };
  }

  const produto = await prisma.produto.findFirst({
    where: {
      ...scopedByTenantCompany(scope),
      ...(produtoId ? { id: produtoId } : { sku }),
      ativo: true
    },
    select: { id: true, sku: true, nome: true, unidade: true }
  });
  if (!produto) return { encontrado: false, motivo: "Produto não encontrado." };

  const saldos = await prisma.estoqueSaldo.findMany({
    where: { ...scopedByTenantCompany(scope), produtoId: produto.id },
    select: { quantidade: true, reservado: true, minimo: true }
  });

  const quantidade = saldos.reduce((s, x) => s + Number(x.quantidade), 0);
  const reservado = saldos.reduce((s, x) => s + Number(x.reservado), 0);
  const minimo = saldos.reduce((s, x) => s + Number(x.minimo), 0);

  return {
    encontrado: true,
    sku: produto.sku,
    nome: produto.nome,
    unidade: produto.unidade,
    quantidade,
    reservado,
    disponivel: quantidade - reservado,
    minimo,
    abaixoDoMinimo: minimo > 0 && quantidade - reservado < minimo
  };
}
