import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/slug";

/**
 * Dados de referência GLOBAIS (compartilhados por todas as empresas): categorias-padrão e
 * unidades de medida. Populam as tabelas globais `CategoriaPadrao` / `UnidadeMedida`, que
 * alimentam o seletor do cadastro e o grounding da IA. Cada empresa ainda pode criar categorias
 * próprias (ProdutoCategoria, por empresa) — o seletor mostra as padrão + as próprias.
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

export const UNIDADES_BASE: Array<{ codigo: string; nome: string }> = [
  { codigo: "UN", nome: "Unidade" },
  { codigo: "PC", nome: "Peça" },
  { codigo: "PAR", nome: "Par" },
  { codigo: "CX", nome: "Caixa" },
  { codigo: "FD", nome: "Fardo" },
  { codigo: "SC", nome: "Saco" },
  { codigo: "KG", nome: "Quilograma" },
  { codigo: "G", nome: "Grama" },
  { codigo: "TON", nome: "Tonelada" },
  { codigo: "L", nome: "Litro" },
  { codigo: "ML", nome: "Mililitro" },
  { codigo: "GL", nome: "Galão" },
  { codigo: "LT", nome: "Lata" },
  { codigo: "M", nome: "Metro" },
  { codigo: "M2", nome: "Metro quadrado" },
  { codigo: "M3", nome: "Metro cúbico" },
  { codigo: "RL", nome: "Rolo" },
  { codigo: "JG", nome: "Jogo" },
  { codigo: "KIT", nome: "Kit" },
  { codigo: "DZ", nome: "Dúzia" },
  { codigo: "CT", nome: "Cento" },
  { codigo: "MIL", nome: "Milheiro" }
];

/** Popula as categorias-padrão globais (idempotente). */
export async function applyDefaultCategoriasPadrao(): Promise<{ total: number }> {
  const data = CATEGORIAS_BASE.map((nome) => ({ slug: slugify(nome), nome })).filter((c) => c.slug);
  await prisma.categoriaPadrao.createMany({ data, skipDuplicates: true });
  // Mantém o nome atualizado caso tenha mudado.
  await Promise.all(data.map((c) => prisma.categoriaPadrao.update({ where: { slug: c.slug }, data: { nome: c.nome } }).catch(() => null)));
  const total = await prisma.categoriaPadrao.count();
  return { total };
}

/** Popula as unidades de medida globais (idempotente). */
export async function applyDefaultUnidades(): Promise<{ total: number }> {
  await prisma.unidadeMedida.createMany({ data: UNIDADES_BASE, skipDuplicates: true });
  const total = await prisma.unidadeMedida.count();
  return { total };
}
