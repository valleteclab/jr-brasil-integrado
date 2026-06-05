"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { ErpShellBadges, ErpShellContext } from "@/lib/services/erp-shell";
import { moduloFromPath, moduloVisivelNoTipoNegocio } from "@/lib/auth/modules";

const TIPO_NEGOCIO_LABEL: Record<string, string> = {
  VENDA: "Vendas",
  SERVICO: "Serviços",
  AMBOS: "Vendas & Serviços"
};

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
      { label: "PDV (tela cheia)", href: "/pdv", icon: "🛒", accent: true },
      { label: "Novo atendimento", href: "/erp/atendimento", icon: "＋" },
      { label: "Caixa", href: "/erp/caixa", icon: "🧮" },
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
      { label: "Regras tributárias", href: "/erp/regras-tributarias", icon: "⚖" },
      { label: "Regras de finalidade", href: "/erp/regras-finalidade", icon: "🏷" }
    ]
  },
  {
    group: "Análises",
    items: [
      { label: "Relatórios", href: "/erp/relatorios", icon: "📊" },
      { label: "Assistente IA", href: "/erp/assistente", icon: "✦" }
    ]
  },
  {
    group: "Configurações",
    items: [
      { label: "Dados da empresa", href: "/erp/configuracoes/empresa", icon: "🏢" },
      { label: "Emissão fiscal", href: "/erp/configuracoes/fiscal", icon: "⚙" },
      { label: "IA do ERP", href: "/erp/configuracoes/ia", icon: "✦" },
      { label: "WhatsApp", href: "/erp/configuracoes/whatsapp", icon: "💬" }
    ]
  }
];

type ErpShellProps = { children: ReactNode; context: ErpShellContext; modulos: string[] };

function isActive(pathname: string, href: string) {
  if (href === "/erp") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ErpShell({ children, context, modulos }: ErpShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const producao = context.ambiente === "PRODUCAO";

  // Gate por módulo: item visível se o módulo do href estiver liberado ao perfil E for
  // relevante para o tipo de negócio da empresa (esconde o que ela não usa).
  const podeVer = (href: string) => {
    const modulo = moduloFromPath(href);
    if (!modulo) return true;
    return modulos.includes(modulo) && moduloVisivelNoTipoNegocio(modulo, context.tipoNegocio);
  };
  const gruposVisiveis = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => podeVer(i.href)) }))
    .filter((g) => g.items.length > 0);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="erp-app">
      <aside className="erp-side">
        <div className="erp-side-head">
          <div className="mark">JR</div>
          <div>
            <b>{context.empresaNome}</b>
            <span>{TIPO_NEGOCIO_LABEL[context.tipoNegocio] ?? "ERP"}</span>
          </div>
        </div>
        <div className="erp-side-nav">
          {gruposVisiveis.map((g) => (
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
          <Link className="btn-erp ghost icon-only" style={{ borderColor: "rgba(255,255,255,.08)", background: "transparent", color: "#cbd5e1" }} href="/erp/conta/senha" aria-label="Trocar senha" title="Trocar senha">🔑</Link>
          <button type="button" className="btn-erp ghost icon-only" style={{ borderColor: "rgba(255,255,255,.08)", background: "transparent", color: "#cbd5e1" }} onClick={sair} aria-label="Sair" title="Sair">⏻</button>
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
            <Link className="erp-top-btn" href="/erp/configuracoes/empresa" aria-label="Configurações">⚙</Link>
          </div>
        </header>
        <div className="erp-page">{children}</div>
      </div>
    </div>
  );
}
