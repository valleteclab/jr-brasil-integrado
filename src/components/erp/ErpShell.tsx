"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ErpShellBadges, ErpShellContext } from "@/lib/services/erp-shell";
import { ComunicacaoWidget } from "@/components/erp/ComunicacaoWidget";
import { moduloFromPath, moduloVisivelNoTipoNegocio } from "@/lib/auth/modules";
import { HREF_FLAG, TIPO_VENDA_FLAG, planoEnxuto, rotaPermitidaNoPlano } from "@/lib/auth/feature-flags";

// Escurece um hex #rrggbb (para a variante "dark" usada em hovers/bordas da cor de destaque).
function darken(hex: string, amount = 0.14): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Converte um hex #rrggbb em rgba() — usado nos fundos translúcidos do tema.
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

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
  /** Sobrepõe o módulo RBAC derivado do path (ex.: itens fiscais que exigem outro módulo). */
  modulo?: string;
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
      { label: "Ordens de Serviço", href: "/erp/os", icon: "🔧", badgeKey: "os" },
      { label: "Técnicos", href: "/erp/tecnicos", icon: "👨‍🔧" },
      { label: "Expedição", href: "/erp/expedicao", icon: "📤" }
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
      { label: "Gastos (cupom)", href: "/erp/gastos", icon: "💸" },
      { label: "Fluxo de caixa", href: "/erp/fluxo-caixa", icon: "📈" },
      { label: "NF-e emitidas", href: "/erp/fiscal", icon: "🧾" },
      { label: "NFS-e (Nacional)", href: "/erp/nfse-recebidas", icon: "📑" },
      { label: "SPED Fiscal", href: "/erp/sped-fiscal", icon: "🗂" },
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
      { label: "Aparência", href: "/erp/configuracoes/aparencia", icon: "🎨" },
      { label: "Contas financeiras", href: "/erp/configuracoes/contas-financeiras", icon: "🏦" },
      { label: "Formas de pagamento", href: "/erp/configuracoes/formas-pagamento", icon: "💳" },
      { label: "Máquinas de cartão", href: "/erp/configuracoes/maquinas-cartao", icon: "💳" },
      { label: "Emissão fiscal", href: "/erp/configuracoes/fiscal", icon: "⚙" },
      { label: "Catálogo Cosmos", href: "/erp/configuracoes/cosmos", icon: "🔎" },
      { label: "IA do ERP", href: "/erp/configuracoes/ia", icon: "✦" },
      { label: "WhatsApp", href: "/erp/configuracoes/whatsapp", icon: "💬" },
      { label: "E-mail (envio)", href: "/erp/configuracoes/email", icon: "✉" }
    ]
  }
];

/** Menu do plano EMISSOR DE NOTAS: foco total em emitir NF-e/NFS-e (MEI e Simples). */
// Itens do EMISSOR com módulo RBAC fino: "Emitir NF-e" exige o módulo PRODUTOS (NF-e é nota de
// produto) e "Simples/MEI" exige FINANCEIRO (apuração) — assim um perfil operacional (ex.: só
// NFS-e + clientes) esconde o resto, sem mexer em código por cliente.
const groupsEmissor: ErpNavGroup[] = [
  {
    group: "Emissor de Notas",
    items: [
      { label: "Início", href: "/erp", icon: "▦" },
      { label: "Emitir NF-e", href: "/erp/fiscal/emitir", icon: "🧾", accent: true, modulo: "produtos" },
      { label: "Emitir NFS-e", href: "/erp/fiscal/emitir/nfse", icon: "📑", accent: true },
      { label: "Notas emitidas", href: "/erp/fiscal", icon: "🗂" },
      { label: "Simples / MEI", href: "/erp/fiscal/simples", icon: "📊", modulo: "financeiro" }
    ]
  },
  {
    group: "Cadastros",
    items: [
      { label: "Clientes", href: "/erp/clientes", icon: "👥" },
      { label: "Produtos / Serviços", href: "/erp/produtos", icon: "📦" }
    ]
  },
  {
    group: "Configurações",
    items: [
      { label: "Dados da empresa", href: "/erp/configuracoes/empresa", icon: "🏢" },
      { label: "Emissão fiscal (certificado)", href: "/erp/configuracoes/fiscal", icon: "⚙" },
      { label: "E-mail (envio)", href: "/erp/configuracoes/email", icon: "✉" },
      { label: "Usuários & permissões", href: "/erp/colaboradores", icon: "👤" }
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
  // Menu lateral vira drawer no celular (≤900px). Fecha ao navegar.
  const [menuAberto, setMenuAberto] = useState(false);
  useEffect(() => { setMenuAberto(false); }, [pathname]);

  // "Novo atendimento" só aparece se houver ao menos um tipo de venda liberado pelo dono do SaaS.
  const algumTipoVenda = Object.values(TIPO_VENDA_FLAG).some((flag) => context.features[flag]);

  // Gate por módulo: item visível se (1) a flag por tenant do dono do SaaS estiver ligada,
  // (2) o módulo for liberado ao perfil (RBAC) e (3) relevante para o tipo de negócio da empresa.
  const podeVer = (href: string, moduloOverride?: string) => {
    // Gate por tenant (dono do SaaS): href mapeado em HREF_FLAG → respeita a flag liberada.
    const flag = HREF_FLAG[href];
    if (flag && !context.features[flag]) return false;
    // "Novo atendimento" não tem flag própria — depende de existir algum tipo de venda liberado.
    if (href === "/erp/atendimento" && !algumTipoVenda) return false;
    const modulo = moduloOverride ?? moduloFromPath(href);
    if (!modulo) return true;
    return modulos.includes(modulo as Parameters<typeof moduloVisivelNoTipoNegocio>[0]) && moduloVisivelNoTipoNegocio(modulo as Parameters<typeof moduloVisivelNoTipoNegocio>[0], context.tipoNegocio);
  };
  const emissor = planoEnxuto(context.plano);
  // Plano CHAT: nav do Emissor + Assistente IA + Gastos (foto do cupom).
  const gruposDoPlano = context.plano === "CHAT"
    ? groupsEmissor.map((g) =>
        g.group === "Emissor de Notas"
          ? { ...g, group: "Assistente & Notas", items: [g.items[0], { label: "Assistente IA", href: "/erp/assistente", icon: "💬", accent: true }, ...g.items.slice(1)] }
          : g.group === "Cadastros"
            ? { ...g, items: [...g.items, { label: "Gastos (foto do cupom)", href: "/erp/gastos", icon: "🧾" }] }
            : g
      )
    : groupsEmissor;
  const gruposVisiveis = (emissor ? gruposDoPlano : groups)
    .map((g) => ({ ...g, items: g.items.filter((i) => podeVer(i.href, i.modulo)) }))
    .filter((g) => g.items.length > 0);

  // Guard do plano EMISSOR: URLs fora do escopo do emissor voltam para o início (o menu já não
  // as mostra; isto cobre o acesso direto por URL/rota antiga). Também cobre itens ESCONDIDOS
  // pelo RBAC fino (ex.: Emitir NF-e sem o módulo produtos): o item de melhor match (href mais
  // específico) precisa estar visível.
  useEffect(() => {
    if (!emissor) return;
    if (!rotaPermitidaNoPlano(context.plano, pathname)) { router.replace("/erp"); return; }
    const todos = gruposDoPlano.flatMap((g) => g.items);
    const melhor = todos
      .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0];
    if (melhor && melhor.href !== "/erp" && !podeVer(melhor.href, melhor.modulo)) router.replace("/erp");
  }, [emissor, pathname, router]);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  // Cor de destaque da empresa: sobrescreve as variáveis de tema (as demais derivam destas).
  // Inclui o fundo translúcido do item ativo do menu (que no CSS base é um rgba amarelo fixo).
  const temaVars = context.corDestaque
    ? ({
        "--jr-yellow": context.corDestaque,
        "--jr-yellow-dk": darken(context.corDestaque),
        "--erp-side-active": hexToRgba(context.corDestaque, 0.14)
      } as CSSProperties)
    : undefined;

  return (
    <div className="erp-app" style={temaVars}>
      {menuAberto && <div className="erp-side-bd" onClick={() => setMenuAberto(false)} aria-hidden="true" />}
      <aside className={`erp-side${menuAberto ? " erp-side--open" : ""}`}>
        <div className="erp-side-head">
          {context.logoSistema ? (
            // Fundo claro atrás da logo: garante legibilidade de logos com cores escuras sobre a
            // barra lateral escura (funciona para qualquer logo, transparente ou não).
            <span style={{ background: "#fff", borderRadius: 8, padding: "6px 10px", display: "inline-flex", alignItems: "center", width: "100%", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={context.logoSistema} alt={context.empresaNome} style={{ maxWidth: "100%", maxHeight: 36, objectFit: "contain", display: "block" }} />
            </span>
          ) : (
            // Sem logo do cliente: usa o ícone do XERP (marca do produto) como fallback.
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/icons/xerp-192.png" alt="XERP" width={32} height={32} style={{ borderRadius: 7, display: "block" }} />
          )}
          {!context.logoSistema && (
            <div>
              <b>{context.empresaNome}</b>
              <span>{TIPO_NEGOCIO_LABEL[context.tipoNegocio] ?? "ERP"}</span>
            </div>
          )}
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
        {(emissor || context.trialFimEm) && (
          <div style={{ padding: "8px 14px", fontSize: 11, lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,.08)" }}>
            {emissor && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true">🧾</span>
                <span><strong>Plano Emissor de Notas</strong><br />Quer PDV, financeiro, IA e WhatsApp? Fale com o suporte para fazer upgrade.</span>
              </div>
            )}
            {context.trialFimEm && !context.trialVencido && (
              <div style={{ marginTop: emissor ? 6 : 0, color: "#fbbf24" }}>
                ⏳ Teste grátis até {new Date(context.trialFimEm).toLocaleDateString("pt-BR")}
              </div>
            )}
          </div>
        )}
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
          <button type="button" className="erp-menu-btn" onClick={() => setMenuAberto((v) => !v)} aria-label="Abrir menu">☰</button>
          <div className="erp-top-search">
            <span className="ic-sr" aria-hidden="true">⌕</span>
            <input placeholder="Buscar pedido, NF, cliente, produto, código… (⌘ K)" />
            <span className="kbd">⌘ K</span>
          </div>
          <div className="erp-top-actions">
            <span className={`erp-env${producao ? "" : " homolog"}`}><span className="dot" />{producao ? "Produção" : "Homologação"}</span>
            {context.features.lojaHabilitada && <Link className="erp-top-btn" href="/loja">⤴ Ver loja</Link>}
            <ComunicacaoWidget />
            <Link className="erp-top-btn" href="/erp/configuracoes/empresa" aria-label="Configurações">⚙</Link>
          </div>
        </header>
        {context.mensalidade.aviso && (
          <div style={{ background: "#fef3c7", borderBottom: "1px solid #fcd34d", color: "#92400e", padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 13.5 }}>
            <span>
              ⚠️ <strong>Mensalidade em atraso.</strong> Regularize para não perder o acesso
              {context.mensalidade.diasAteBloqueio != null ? ` — bloqueio em ${context.mensalidade.diasAteBloqueio} dia(s).` : "."}
            </span>
            {context.mensalidade.faturaUrl && (
              <a href={context.mensalidade.faturaUrl} target="_blank" rel="noreferrer" style={{ background: "#2563eb", color: "#fff", padding: "6px 14px", borderRadius: 6, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                💳 Pagar mensalidade
              </a>
            )}
          </div>
        )}
        <div className="erp-page">{children}</div>
      </div>
    </div>
  );
}
