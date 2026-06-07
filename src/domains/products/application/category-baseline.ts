import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { slugify } from "@/lib/slug";

/**
 * Conjunto-base de categorias de produto, abrangendo os ramos atendidos (peças automotivas/
 * agrícolas, material de construção e varejo geral). Serve para popular a tabela `ProdutoCategoria`
 * e ancorar a sugestão de categoria da IA. O usuário pode editar/criar livremente depois.
 */
export const CATEGORIAS_BASE: string[] = [
  // Peças e componentes (auto/agro)
  "Filtros",
  "Correias",
  "Rolamentos",
  "Baterias",
  "Amortecedores e Suspensão",
  "Motor e Componentes",
  "Sistema Elétrico",
  "Sistema de Freios",
  "Pneus e Rodas",
  "Lubrificantes e Óleos",
  "Mangueiras e Conexões",
  "Vedação e Juntas",
  // Material de construção
  "Ferramentas Manuais",
  "Ferramentas Elétricas",
  "Material Elétrico",
  "Material Hidráulico",
  "Tintas e Acessórios",
  "Fixadores (Parafusos e Pregos)",
  "Cimento e Argamassa",
  "Tubos e Conexões",
  "Abrasivos",
  "EPI - Proteção Individual",
  "Iluminação",
  "Madeiras e Esquadrias",
  // Varejo geral
  "Bebidas",
  "Alimentos",
  "Limpeza",
  "Higiene",
  "Papelaria",
  "Embalagens",
  "Diversos"
];

export type CategoriaBaselineInput = Omit<
  Prisma.ProdutoCategoriaCreateManyInput,
  "tenantId" | "empresaId" | "id" | "criadoEm" | "atualizadoEm"
>;

/**
 * Popula as categorias-base para a empresa do escopo de forma idempotente (upsert por slug).
 * Não remove nem renomeia categorias existentes — apenas garante que as base existam.
 */
export async function applyDefaultCategories(scope: TenantScope): Promise<{ criadas: number; total: number }> {
  const existentes = await prisma.produtoCategoria.findMany({
    where: scopedByTenantCompany(scope),
    select: { slug: true }
  });
  const slugsExistentes = new Set(existentes.map((c) => c.slug));

  const novas = CATEGORIAS_BASE
    .map((nome) => ({ nome, slug: slugify(nome) }))
    .filter((c) => c.slug && !slugsExistentes.has(c.slug));

  if (novas.length) {
    await prisma.produtoCategoria.createMany({
      data: novas.map((c) => ({
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: c.nome,
        slug: c.slug
      })),
      skipDuplicates: true
    });
  }

  const total = await prisma.produtoCategoria.count({ where: scopedByTenantCompany(scope) });
  return { criadas: novas.length, total };
}
