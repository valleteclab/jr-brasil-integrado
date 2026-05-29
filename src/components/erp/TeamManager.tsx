"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { ColaboradorSummary, PerfilSummary } from "@/lib/services/team";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODULOS = [
  "usuarios",
  "empresas",
  "produtos",
  "clientes",
  "pedidos",
  "estoque",
  "financeiro",
  "fiscal"
] as const;

const ACOES = ["visualizar", "gerenciar"] as const;

type Modulo = typeof MODULOS[number];
type Acao = typeof ACOES[number];

const MODULO_LABELS: Record<Modulo, string> = {
  usuarios: "Usuários",
  empresas: "Empresas",
  produtos: "Produtos",
  clientes: "Clientes",
  pedidos: "Pedidos",
  estoque: "Estoque",
  financeiro: "Financeiro",
  fiscal: "Fiscal"
};

const ACAO_LABELS: Record<Acao, string> = {
  visualizar: "Visualizar",
  gerenciar: "Gerenciar"
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TeamTab = "colaboradores" | "perfis";

type InviteForm = {
  nome: string;
  email: string;
  perfilId: string;
};

type PerfilForm = {
  nome: string;
  descricao: string;
  permissoes: Record<Modulo, Set<Acao>>;
};

type TeamManagerProps = {
  initialColaboradores: ColaboradorSummary[];
  initialPerfis: PerfilSummary[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyPermissoes(): Record<Modulo, Set<Acao>> {
  return Object.fromEntries(MODULOS.map((m) => [m, new Set<Acao>()])) as Record<Modulo, Set<Acao>>;
}

function emptyPerfilForm(): PerfilForm {
  return { nome: "", descricao: "", permissoes: emptyPermissoes() };
}

function emptyInviteForm(): InviteForm {
  return { nome: "", email: "", perfilId: "" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeamManager({ initialColaboradores, initialPerfis }: TeamManagerProps) {
  const [tab, setTab] = useState<TeamTab>("colaboradores");
  const [colaboradores, setColaboradores] = useState<ColaboradorSummary[]>(initialColaboradores);
  const [perfis, setPerfis] = useState<PerfilSummary[]>(initialPerfis);

  // Invite drawer
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm());
  const [inviteError, setInviteError] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);

  // Perfil drawer
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [perfilForm, setPerfilForm] = useState<PerfilForm>(emptyPerfilForm());
  const [perfilError, setPerfilError] = useState("");
  const [perfilSaving, setPerfilSaving] = useState(false);

  const [actioning, setActioning] = useState<string | null>(null);

  // KPIs
  const kpis = useMemo(() => ({
    total: colaboradores.length,
    ativos: colaboradores.filter((c) => c.ativo).length,
    inativos: colaboradores.filter((c) => !c.ativo).length,
    perfisTotal: perfis.length
  }), [colaboradores, perfis]);

  // ---------------------------------------------------------------------------
  // Invite
  // ---------------------------------------------------------------------------

  function openInvite() {
    setInviteForm(emptyInviteForm());
    setInviteError("");
    setInviteOpen(true);
  }

  function closeInvite() {
    setInviteOpen(false);
    setInviteError("");
  }

  async function saveInvite() {
    if (!inviteForm.nome.trim()) { setInviteError("Nome é obrigatório."); return; }
    if (!inviteForm.email.trim()) { setInviteError("E-mail é obrigatório."); return; }
    if (!inviteForm.perfilId) { setInviteError("Selecione um perfil."); return; }

    setInviteSaving(true);
    setInviteError("");

    try {
      const response = await fetch("/api/erp/colaboradores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm)
      });
      const data = await response.json() as { id?: string; error?: string };

      if (!response.ok) throw new Error(data.error ?? "Não foi possível convidar o colaborador.");

      const perfil = perfis.find((p) => p.id === inviteForm.perfilId);
      const novo: ColaboradorSummary = {
        vinculoId: data.id ?? `local-${Date.now()}`,
        usuarioId: "",
        nome: inviteForm.nome.trim(),
        email: inviteForm.email.toLowerCase().trim(),
        perfilId: inviteForm.perfilId,
        perfilNome: perfil?.nome ?? "",
        ativo: true,
        criadoEm: new Date().toISOString()
      };
      setColaboradores((prev) => [novo, ...prev]);
      closeInvite();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Erro ao convidar colaborador.");
    } finally {
      setInviteSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Perfil
  // ---------------------------------------------------------------------------

  function openPerfil() {
    setPerfilForm(emptyPerfilForm());
    setPerfilError("");
    setPerfilOpen(true);
  }

  function closePerfil() {
    setPerfilOpen(false);
    setPerfilError("");
  }

  function togglePermissao(modulo: Modulo, acao: Acao) {
    setPerfilForm((prev) => {
      const current = new Set(prev.permissoes[modulo]);
      if (current.has(acao)) {
        current.delete(acao);
      } else {
        current.add(acao);
        // "gerenciar" implica "visualizar"
        if (acao === "gerenciar") current.add("visualizar");
      }
      return { ...prev, permissoes: { ...prev.permissoes, [modulo]: current } };
    });
  }

  function toggleModuloAll(modulo: Modulo) {
    setPerfilForm((prev) => {
      const current = prev.permissoes[modulo];
      const hasAll = ACOES.every((a) => current.has(a));
      const next = new Set<Acao>(hasAll ? [] : ACOES);
      return { ...prev, permissoes: { ...prev.permissoes, [modulo]: next } };
    });
  }

  async function savePerfil() {
    if (!perfilForm.nome.trim()) { setPerfilError("Nome do perfil é obrigatório."); return; }

    const permissoes = MODULOS.flatMap((m) =>
      Array.from(perfilForm.permissoes[m]).map((a) => ({ modulo: m, acao: a }))
    );

    setPerfilSaving(true);
    setPerfilError("");

    try {
      const response = await fetch("/api/erp/perfis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: perfilForm.nome.trim(), descricao: perfilForm.descricao.trim() || null, permissoes })
      });
      const data = await response.json() as { id?: string; error?: string };

      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o perfil.");

      const novo: PerfilSummary = {
        id: data.id ?? `local-${Date.now()}`,
        nome: perfilForm.nome.trim(),
        descricao: perfilForm.descricao.trim() || null,
        totalPermissoes: permissoes.length,
        permissoes
      };
      setPerfis((prev) => [...prev, novo]);
      closePerfil();
    } catch (err) {
      setPerfilError(err instanceof Error ? err.message : "Erro ao criar perfil.");
    } finally {
      setPerfilSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Toggle vinculo
  // ---------------------------------------------------------------------------

  async function toggleVinculo(vinculoId: string, ativo: boolean) {
    setActioning(vinculoId);
    try {
      const response = await fetch(`/api/erp/colaboradores/${vinculoId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo })
      });
      const data = await response.json() as { ativo?: boolean; error?: string };

      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o status.");

      setColaboradores((prev) =>
        prev.map((c) => c.vinculoId === vinculoId ? { ...c, ativo: data.ativo ?? ativo } : c)
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao atualizar status.");
    } finally {
      setActioning(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* KPIs */}
      <div className="kpi-row">
        <KpiCard label="Total de colaboradores" value={String(kpis.total)} />
        <KpiCard label="Ativos" value={String(kpis.ativos)} tone="success" />
        <KpiCard label="Inativos" value={String(kpis.inativos)} tone="warn" />
        <KpiCard label="Perfis de acesso" value={String(kpis.perfisTotal)} tone="info" />
      </div>

      {/* Tabs */}
      <div className="erp-page-actions">
        <nav className="tabs" style={{ flexShrink: 0 }}>
          <button
            type="button"
            className={tab === "colaboradores" ? "active" : ""}
            onClick={() => setTab("colaboradores")}
          >
            Colaboradores
          </button>
          <button
            type="button"
            className={tab === "perfis" ? "active" : ""}
            onClick={() => setTab("perfis")}
          >
            Perfis e permissões
          </button>
        </nav>
        <div className="toolbar-grow" />
        {tab === "colaboradores" && (
          <Button type="button" onClick={openInvite}>+ Convidar colaborador</Button>
        )}
        {tab === "perfis" && (
          <Button type="button" onClick={openPerfil}>+ Novo perfil</Button>
        )}
      </div>

      {/* Colaboradores */}
      {tab === "colaboradores" && (
        <section className="panel">
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th className="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {colaboradores.map((c) => (
                  <tr key={c.vinculoId}>
                    <td><strong>{c.nome}</strong></td>
                    <td className="mono">{c.email}</td>
                    <td><span className="category-pill">{c.perfilNome}</span></td>
                    <td>
                      <StatusBadge tone={c.ativo ? "success" : "mute"}>
                        {c.ativo ? "Ativo" : "Inativo"}
                      </StatusBadge>
                    </td>
                    <td className="actions">
                      {c.ativo ? (
                        <button
                          type="button"
                          className="danger-link"
                          disabled={actioning === c.vinculoId}
                          onClick={() => toggleVinculo(c.vinculoId, false)}
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={actioning === c.vinculoId}
                          onClick={() => toggleVinculo(c.vinculoId, true)}
                        >
                          Ativar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!colaboradores.length && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-st">Nenhum colaborador cadastrado. Convide o primeiro colaborador.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Perfis */}
      {tab === "perfis" && (
        <section className="panel">
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Perfil</th>
                  <th>Descrição</th>
                  <th className="num">Permissões</th>
                  <th>Módulos com acesso</th>
                </tr>
              </thead>
              <tbody>
                {perfis.map((p) => {
                  const modulos = Array.from(new Set(p.permissoes.map((pm) => pm.modulo)));
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.nome}</strong></td>
                      <td>{p.descricao ?? <span className="muted">—</span>}</td>
                      <td className="num">{p.totalPermissoes}</td>
                      <td>
                        {modulos.map((m) => (
                          <span key={m} className="category-pill">{m}</span>
                        ))}
                        {!modulos.length && <span className="muted">Sem permissões</span>}
                      </td>
                    </tr>
                  );
                })}
                {!perfis.length && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-st">Nenhum perfil criado. Crie o primeiro perfil de acesso.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Invite drawer */}
      {inviteOpen && (
        <>
          <div className="drawer-bd" onClick={closeInvite} />
          <aside className="drawer" aria-label="Convidar colaborador">
            <header className="drawer-head">
              <div>
                <h2>Convidar colaborador</h2>
                <p>O acesso será criado com senha temporária &quot;change-me&quot;.</p>
              </div>
              <button type="button" onClick={closeInvite}>Fechar</button>
            </header>
            <div className="drawer-body">
              <div className="erp-form">
                <label className="full">
                  Nome completo
                  <input
                    value={inviteForm.nome}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, nome: e.target.value }))}
                  />
                </label>
                <label className="full">
                  E-mail
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </label>
                <label className="full">
                  Perfil de acesso
                  <select
                    value={inviteForm.perfilId}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, perfilId: e.target.value }))}
                  >
                    <option value="">Selecione um perfil...</option>
                    {perfis.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  {!perfis.length && (
                    <small className="field-hint">Crie ao menos um perfil antes de convidar colaboradores.</small>
                  )}
                </label>
              </div>
              {inviteError && <p className="form-error drawer-error">{inviteError}</p>}
            </div>
            <footer className="drawer-foot">
              <Button type="button" variant="light" onClick={closeInvite}>Cancelar</Button>
              <Button type="button" disabled={inviteSaving} onClick={saveInvite}>
                {inviteSaving ? "Salvando..." : "Convidar"}
              </Button>
            </footer>
          </aside>
        </>
      )}

      {/* Perfil drawer */}
      {perfilOpen && (
        <>
          <div className="drawer-bd" onClick={closePerfil} />
          <aside className="drawer product-drawer" aria-label="Novo perfil">
            <header className="drawer-head">
              <div>
                <h2>Novo perfil de acesso</h2>
                <p>Defina o nome e selecione as permissões por módulo.</p>
              </div>
              <button type="button" onClick={closePerfil}>Fechar</button>
            </header>
            <div className="drawer-body">
              <div className="erp-form">
                <label className="full">
                  Nome do perfil
                  <input
                    value={perfilForm.nome}
                    placeholder="Ex.: Vendedor, Financeiro, Administrador..."
                    onChange={(e) => setPerfilForm((prev) => ({ ...prev, nome: e.target.value }))}
                  />
                </label>
                <label className="full">
                  Descrição
                  <input
                    value={perfilForm.descricao}
                    onChange={(e) => setPerfilForm((prev) => ({ ...prev, descricao: e.target.value }))}
                  />
                </label>
              </div>

              <div style={{ marginTop: "1.5rem" }}>
                <p style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Permissões por módulo</p>
                <div className="erp-table-wrap">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Módulo</th>
                        {ACOES.map((a) => (
                          <th key={a} className="num">{ACAO_LABELS[a]}</th>
                        ))}
                        <th className="num">Todos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODULOS.map((m) => {
                        const perms = perfilForm.permissoes[m];
                        const hasAll = ACOES.every((a) => perms.has(a));
                        return (
                          <tr key={m}>
                            <td><strong>{MODULO_LABELS[m]}</strong></td>
                            {ACOES.map((a) => (
                              <td key={a} className="num">
                                <input
                                  type="checkbox"
                                  checked={perms.has(a)}
                                  onChange={() => togglePermissao(m, a)}
                                  aria-label={`${MODULO_LABELS[m]} - ${ACAO_LABELS[a]}`}
                                />
                              </td>
                            ))}
                            <td className="num">
                              <input
                                type="checkbox"
                                checked={hasAll}
                                onChange={() => toggleModuloAll(m)}
                                aria-label={`Todos em ${MODULO_LABELS[m]}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {perfilError && <p className="form-error drawer-error">{perfilError}</p>}
            </div>
            <footer className="drawer-foot">
              <Button type="button" variant="light" onClick={closePerfil}>Cancelar</Button>
              <Button type="button" disabled={perfilSaving} onClick={savePerfil}>
                {perfilSaving ? "Salvando..." : "Criar perfil"}
              </Button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
