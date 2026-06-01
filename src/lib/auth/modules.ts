/**
 * Catálogo de módulos do ERP e matriz de acesso por perfil (RBAC por módulo).
 * O acesso é por MÓDULO (o perfil acessa ou não cada área do menu). A enforcement
 * acontece no menu (ErpShell), no layout/middleware e nas rotas via requireModule.
 */

export type ModuloKey =
  | "dashboard"
  | "atendimento"
  | "caixa"
  | "vendas"
  | "orcamentos"
  | "os"
  | "compras"
  | "estoque"
  | "inventarios"
  | "produtos"
  | "clientes"
  | "fornecedores"
  | "colaboradores"
  | "regras-tributarias"
  | "financeiro"
  | "fluxo-caixa"
  | "fiscal"
  | "relatorios"
  | "assistente"
  | "configuracoes";

export const MODULOS: Array<{ key: ModuloKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "atendimento", label: "Atendimento" },
  { key: "caixa", label: "Caixa" },
  { key: "vendas", label: "Vendas" },
  { key: "orcamentos", label: "Orçamentos" },
  { key: "os", label: "Ordens de Serviço" },
  { key: "compras", label: "Compras" },
  { key: "estoque", label: "Estoque" },
  { key: "inventarios", label: "Inventários" },
  { key: "produtos", label: "Produtos" },
  { key: "clientes", label: "Clientes" },
  { key: "fornecedores", label: "Fornecedores" },
  { key: "colaboradores", label: "Colaboradores" },
  { key: "regras-tributarias", label: "Regras tributárias" },
  { key: "financeiro", label: "Financeiro" },
  { key: "fluxo-caixa", label: "Fluxo de caixa" },
  { key: "fiscal", label: "Notas fiscais" },
  { key: "relatorios", label: "Relatórios" },
  { key: "assistente", label: "Assistente IA" },
  { key: "configuracoes", label: "Configurações" }
];

export const TODOS_MODULOS: ModuloKey[] = MODULOS.map((m) => m.key);

/** Perfis padrão (SECURITY_MULTI_TENANCY.md) e os módulos que cada um acessa. */
export const PERFIS_PADRAO: Array<{ nome: string; descricao: string; modulos: ModuloKey[] | "*" }> = [
  { nome: "SUPER_ADMIN", descricao: "Acesso total à plataforma.", modulos: "*" },
  { nome: "COMPANY_ADMIN", descricao: "Administra a empresa (todos os módulos).", modulos: "*" },
  {
    nome: "SALES",
    descricao: "Vendas, atendimento, caixa e orçamentos.",
    modulos: ["dashboard", "atendimento", "caixa", "vendas", "orcamentos", "os", "clientes", "produtos", "assistente"]
  },
  {
    nome: "STOCK",
    descricao: "Estoque, inventários e produtos.",
    modulos: ["dashboard", "estoque", "inventarios", "produtos", "compras"]
  },
  {
    nome: "PURCHASE",
    descricao: "Compras e fornecedores.",
    modulos: ["dashboard", "compras", "fornecedores", "produtos", "estoque"]
  },
  {
    nome: "WORKSHOP",
    descricao: "Oficina: ordens de serviço.",
    modulos: ["dashboard", "os", "clientes", "produtos", "estoque"]
  },
  {
    nome: "FINANCE",
    descricao: "Financeiro, fluxo de caixa e relatórios.",
    modulos: ["dashboard", "financeiro", "fluxo-caixa", "relatorios", "assistente"]
  },
  {
    nome: "FISCAL",
    descricao: "Notas fiscais, regras tributárias e configuração fiscal.",
    modulos: ["dashboard", "fiscal", "regras-tributarias", "configuracoes"]
  }
];

/** Resolve a módulo a partir de um caminho /erp/... (ou href de menu). */
export function moduloFromPath(path: string): ModuloKey | null {
  const clean = path.replace(/^\/+/, "").replace(/^erp\/?/, "");
  if (clean === "" || clean === "erp") return "dashboard";
  const seg = clean.split("/")[0];
  if (seg === "configuracoes") return "configuracoes";
  return (TODOS_MODULOS as string[]).includes(seg) ? (seg as ModuloKey) : null;
}

/** Expande "*" para a lista completa de módulos. */
export function expandModulos(modulos: ModuloKey[] | "*"): ModuloKey[] {
  return modulos === "*" ? [...TODOS_MODULOS] : modulos;
}
