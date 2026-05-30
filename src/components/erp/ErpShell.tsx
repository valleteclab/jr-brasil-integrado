"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { ErpShellBadges, ErpShellContext } from "@/lib/services/erp-shell";

type ErpNavItem = {
  label: string;
  href: string;
  icon: string;
  accent?: boolean;
  badgeKey?: keyof ErpShellBadges;
  danger?: boolean;
};

type ErpNavGroup = { group: string; items: ErpNavItem[] };

const groups: ErpNavGroup[] = [
  {
    group: "Operação",
    items: [
      { label: "Dashboard", href: "/erp", icon: "▦" },
      { label: "Novo atendimento", href: "/erp/atendimento", icon: "＋", accent: true },
      { label: "Vendas", href: "/erp/vendas", icon: "🏪", badgeKey: "vendas" },
      { label: "Orçamentos", href: "/erp/orcamentos", icon: "📄", badgeKey: "orcamentos" },
      { label: "Ordens de Serviço", href: "/erp/os", icon: "🔧", badgeKey: "os" }
    ]
  },
  {
    group: "Suprimentos",
    items: [
      { label: "Compras", href: "/erp/compras", icon: "🚚", badgeKey: "compras" },
      { label: "Estoque", href: "/erp/estoque", icon: "📦", badgeKey: "estoque", danger: true },
      { label: "Fornecedores", href: "/erp/fornecedores", icon: "🏭" },
      { label: "Notas de entrada", href: "/erp/entradas-fiscais", icon: "📥" }
    ]
  },
  {
    group: "Cadastros",
    items: [
      { label: "Produtos", href: "/erp/produtos", icon: "📦" },
      { label: "Clientes", href: "/erp/clientes", icon: "👥" },
      { label: "Colaboradores", href: "/erp/colaboradores", icon: "👤" }
    ]
  },
  {
    group: "Financeiro & Fiscal",
    items: [
      { label: "Contas a pagar/receber", href: "/erp/financeiro", icon: "＄", badgeKey: "financeiro", danger: true },
      { label: "Fluxo de caixa", href: "/erp/fluxo-caixa", icon: "📈" },
      { label: "NF-e emitidas", href: "/erp/fiscal", icon: "🧾" },
      { label: "Regras tributárias", href: "/erp/regras-tributarias", icon: "⚖" }
    ]
  },
  {
    group: "Análises",
    items: [{ label: "Relatórios", href: "/erp/relatorios", icon: "📊" }]
  },
  {
    group: "Configurações",
    items: [
      { label: "Emissão fiscal", href: "/erp/configuracoes/fiscal", icon: "⚙" },
      { label: "IA do ERP", href: "/erp/configuracoes/ia", icon: "✦" }
    ]
  }
];

type ErpShellProps = { children: ReactNode; context: ErpShellContext };

function isActive(pathname: string, href: string) {
  if (href === "/erp") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ErpShell({ children, context }: ErpShellProps) {
  const pathname = usePathname();
  const producao = context.ambiente === "PRODUCAO";

  return (
    <div className="erp-app">
      <aside className="erp-side">
        <div className="erp-side-head">
          <div className="mark">JR</div>
          <div>
            <b>{context.empresaNome}</b>
            <span>Peças & Serviços</span>
          </div>
        </div>
        <div className="erp-side-nav">
          {groups.map((g) => (
            <div className="erp-side-group" key={g.group}>
              <div className="erp-side-group-h">{g.group}</div>
              {g.items.map((item) => {
                const badge = item.badgeKey ? context.badges[item.badgeKey] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={["erp-side-item", item.accent ? "accent" : "", isActive(pathname, item.href) ? "active" : ""].filter(Boolean).join(" ")}
                  >
                    <span className="ic" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    {badge > 0 && <span className={`badge${item.danger ? " danger" : ""}`}>{badge}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <div className="erp-side-foot">
          <div className="avatar-sm">{context.usuarioIniciais}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">{context.usuarioNome}</div>
            <div className="role">{context.usuarioPerfil}</div>
          </div>
          <Link className="btn-erp ghost icon-only" style={{ borderColor: "rgba(255,255,255,.08)", background: "transparent", color: "#cbd5e1" }} href="/erp/configuracoes/fiscal" aria-label="Configurações">⚙</Link>
        </div>
      </aside>

      <div className="erp-main">
        <header className="erp-top">
          <div className="erp-top-search">
            <span className="ic-sr" aria-hidden="true">⌕</span>
            <input placeholder="Buscar pedido, NF, cliente, produto, código… (⌘ K)" />
            <span className="kbd">⌘ K</span>
          </div>
          <div className="erp-top-actions">
            <span className={`erp-env${producao ? "" : " homolog"}`}><span className="dot" />{producao ? "Produção" : "Homologação"}</span>
            <Link className="erp-top-btn" href="/loja">⤴ Ver loja</Link>
            <Link className="erp-top-btn" href="/erp/configuracoes/ia" aria-label="Notificações">🔔</Link>
            <Link className="erp-top-btn" href="/erp/configuracoes/fiscal" aria-label="Configurações">⚙</Link>
          </div>
        </header>
        <div className="erp-page">{children}</div>
      </div>
    </div>
  );
}
