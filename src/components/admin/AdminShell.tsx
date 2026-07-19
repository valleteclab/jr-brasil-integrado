"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

type AdminNavItem = { label: string; href: string; icon: string; accent?: boolean };

const navItems: AdminNavItem[] = [
  { label: "Visão geral", href: "/admin", icon: "▦" },
  { label: "Clientes", href: "/admin/clientes", icon: "🏢" },
  { label: "Novo cliente", href: "/admin/clientes/novo", icon: "＋", accent: true },
  { label: "Usuários", href: "/admin/usuarios", icon: "👤" },
  { label: "Emissões fiscais", href: "/admin/emissoes", icon: "🧾" },
  { label: "Status dos serviços", href: "/admin/status-fiscal", icon: "📡" },
  { label: "Provedor fiscal", href: "/admin/provedor-fiscal", icon: "⚙️" },
  { label: "Crédito & bureau", href: "/admin/credito", icon: "💳" },
  { label: "Planos & preços", href: "/admin/planos", icon: "🏷️" },
  { label: "Reforma Tributária", href: "/admin/reforma", icon: "📜" }
];

type AdminShellProps = { children: ReactNode; usuarioNome: string; usuarioIniciais: string };

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children, usuarioNome, usuarioIniciais }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="erp-app">
      <aside className="erp-side">
        <div className="erp-side-head">
          <div className="mark">PL</div>
          <div>
            <b>Painel da Plataforma</b>
            <span>Administração do SaaS</span>
          </div>
        </div>
        <div className="erp-side-nav">
          <div className="erp-side-group">
            <div className="erp-side-group-h">Plataforma</div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={["erp-side-item", item.accent ? "accent" : "", isActive(pathname, item.href) ? "active" : ""].filter(Boolean).join(" ")}
              >
                <span className="ic" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="erp-side-foot">
          <div className="avatar-sm">{usuarioIniciais}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">{usuarioNome}</div>
            <div className="role">Dono da plataforma</div>
          </div>
          <Link className="btn-erp ghost icon-only" style={{ borderColor: "rgba(255,255,255,.08)", background: "transparent", color: "#cbd5e1" }} href="/erp" aria-label="Voltar ao ERP" title="Voltar ao ERP">⤴</Link>
          <button type="button" className="btn-erp ghost icon-only" style={{ borderColor: "rgba(255,255,255,.08)", background: "transparent", color: "#cbd5e1" }} onClick={sair} aria-label="Sair" title="Sair">⏻</button>
        </div>
      </aside>

      <div className="erp-main">
        <header className="erp-top">
          <div className="erp-top-actions">
            <span className="erp-env"><span className="dot" />Plataforma</span>
            <Link className="erp-top-btn" href="/erp">⤴ Ver ERP</Link>
          </div>
        </header>
        <div className="erp-page">{children}</div>
      </div>
    </div>
  );
}
