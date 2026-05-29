"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { ErpShellBadges, ErpShellContext } from "@/lib/services/erp-shell";

type ErpNavItem = {
  label: string;
  href: string;
  accent?: boolean;
  badgeKey?: keyof ErpShellBadges;
  danger?: boolean;
};

type ErpNavGroup = {
  group: string;
  items: ErpNavItem[];
};

const modules: ErpNavGroup[] = [
  {
    group: "Operação",
    items: [
      { label: "Dashboard", href: "/erp" },
      { label: "Novo atendimento", href: "/erp/atendimento", accent: true },
      { label: "Vendas", href: "/erp/vendas", badgeKey: "vendas" },
      { label: "Orçamentos", href: "/erp/orcamentos", badgeKey: "orcamentos" },
      { label: "Ordens de Serviço", href: "/erp/os", badgeKey: "os" }
    ]
  },
  {
    group: "Suprimentos",
    items: [
      { label: "Compras", href: "/erp/compras", badgeKey: "compras" },
      { label: "Estoque", href: "/erp/estoque", badgeKey: "estoque", danger: true },
      { label: "Fornecedores", href: "/erp/fornecedores" },
      { label: "Notas de entrada", href: "/erp/entradas-fiscais" }
    ]
  },
  {
    group: "Cadastros",
    items: [
      { label: "Produtos", href: "/erp/produtos" },
      { label: "Clientes", href: "/erp/clientes" },
      { label: "Colaboradores", href: "/erp/colaboradores" }
    ]
  },
  {
    group: "Financeiro & Fiscal",
    items: [
      { label: "Contas a pagar/receber", href: "/erp/financeiro", badgeKey: "financeiro", danger: true },
      { label: "Fluxo de caixa", href: "/erp/fluxo-caixa" },
      { label: "NF-e emitidas", href: "/erp/fiscal" },
      { label: "Regras tributárias", href: "/erp/regras-tributarias" }
    ]
  },
  {
    group: "Análises",
    items: [{ label: "Relatórios", href: "/erp/relatorios" }]
  },
  {
    group: "Configurações",
    items: [
      { label: "Emissão fiscal", href: "/erp/configuracoes/fiscal" },
      { label: "IA do ERP", href: "/erp/configuracoes/ia" }
    ]
  }
];

type ErpShellProps = {
  children: ReactNode;
  context: ErpShellContext;
};

function isActive(pathname: string, href: string) {
  if (href === "/erp") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ErpShell({ children, context }: ErpShellProps) {
  const pathname = usePathname();
  const ambienteProducao = context.ambiente === "PRODUCAO";

  return (
    <main className="erp-shell">
      <aside className="erp-sidebar">
        <Link href="/erp" className="erp-brand">
          <span className="brand-mark">JR</span>
          <span>
            <strong>{context.empresaNome}</strong>
            <small>Peças & Serviços</small>
          </span>
        </Link>
        {modules.map((module) => (
          <nav key={module.group}>
            <span>{module.group}</span>
            {module.items.map((item) => {
              const badge = item.badgeKey ? context.badges[item.badgeKey] : 0;
              return (
                <Link
                  className={[
                    item.accent ? "accent" : "",
                    isActive(pathname, item.href) ? "active" : ""
                  ].filter(Boolean).join(" ")}
                  key={item.href}
                  href={item.href}
                >
                  <span className="nav-dot" aria-hidden="true">·</span>
                  {item.label}
                  {badge > 0 && <b className={item.danger ? "danger" : ""}>{badge}</b>}
                </Link>
              );
            })}
          </nav>
        ))}
        <div className="erp-user">
          <span>{context.usuarioIniciais}</span>
          <div>
            <strong>{context.usuarioNome}</strong>
            <small>{context.usuarioPerfil}</small>
          </div>
        </div>
      </aside>
      <section className="erp-main">
        <header className="erp-topbar">
          <div className="erp-search">
            <span aria-hidden="true">⌕</span>
            <input placeholder="Buscar pedido, NF, cliente, produto, código..." />
            <kbd>⌘ K</kbd>
          </div>
          <div className="erp-top-actions">
            <span className={`env-pill${ambienteProducao ? "" : " homolog"}`}>
              <i /> {ambienteProducao ? "Produção" : "Homologação"}
            </span>
            <Link href="/loja">Ver loja</Link>
            <button type="button" aria-label="Notificações">●</button>
            <Link href="/erp/configuracoes/fiscal" aria-label="Configurações">⚙</Link>
          </div>
        </header>
        <section className="erp-content">{children}</section>
      </section>
    </main>
  );
}
