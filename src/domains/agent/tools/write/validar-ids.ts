import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

/**
 * Valida clienteId/produtoIds ANTES do create: erro claro orienta o modelo a corrigir em UMA
 * iteração (consultar_cliente/buscar_produto), em vez de vazar erro cru de FK do Prisma — que
 * queima iterações do loop de tools e polui a conversa.
 */
export async function validarIdsVenda(
  scope: TenantScope,
  clienteId: string | null,
  produtoIds: string[]
): Promise<string | null> {
  if (clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, ...scopedByTenantCompany(scope) },
      select: { id: true }
    });
    if (!cliente) return `clienteId "${clienteId}" não existe nesta empresa. Use consultar_cliente para obter o id correto.`;
  }
  const unicos = [...new Set(produtoIds.filter(Boolean))];
  if (unicos.length) {
    const encontrados = await prisma.produto.findMany({
      where: { id: { in: unicos }, ...scopedByTenantCompany(scope) },
      select: { id: true }
    });
    const ok = new Set(encontrados.map((p) => p.id));
    const faltando = unicos.filter((id) => !ok.has(id));
    if (faltando.length) return `produtoId inválido: ${faltando.join(", ")}. Use buscar_produto para obter o id correto (o campo "id", não o SKU).`;
  }
  return null;
}
