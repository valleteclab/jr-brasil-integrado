"use client";

import { useMemo, useState } from "react";
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
        <div className="kpi">
          <div className="l">Total de colaboradores</div>
          <div className="v">{String(kpis.total)}</div>
        </div>
        <div className="kpi">
          <div className="l">Ativos</div>
          <div className="v">{String(kpis.ativos)}</div>
        </div>
        <div className="kpi">
          <div className="l">Inativos</div>
          <div className="v">{String(kpis.inativos)}</div>
        </div>
        <div className="kpi">
          <div className="l">Perfis de acesso</div>
          <div className="v">{String(kpis.perfisTotal)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="erp-toolbar">
        <nav className="tabs" style={{ flexShrink: 0, borderBottom: 0, padding: 0 }}>
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
        <div className="grow" />
        {tab === "colaboradores" && (
          <button type="button" className="btn-erp primary sm" onClick={openInvite}>+ Convidar colaborador</button>
        )}
        {tab === "perfis" && (
          <button type="button" className="btn-erp primary sm" onClick={openPerfil}>+ Novo perfil</button>
        )}
      </div>

      {/* Colaboradores */}
      {tab === "colaboradores" && (
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
                    <td><div style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</div></td>
                    <td className="mono">{c.email}</td>
                    <td><span className="pill mute">{c.perfilNome}</span></td>
                    <td>
                      <span className={`pill ${c.ativo ? "success" : "mute"}`}>
                        <span className="dot" />
                        {c.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="actions">
                      {c.ativo ? (
                        <button
                          type="button"
                          className="btn-erp danger xs"
                          disabled={actioning === c.vinculoId}
                          onClick={() => toggleVinculo(c.vinculoId, false)}
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-erp ghost xs"
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
                      <div className="empty-st">
                        <h4>Nenhum colaborador cadastrado</h4>
                        <p>Convide o primeiro colaborador para começar.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
      )}

      {/* Perfis */}
      {tab === "perfis" && (
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
                      <td><div style={{ fontWeight: 600, fontSize: 13 }}>{p.nome}</div></td>
                      <td>{p.descricao ?? <span className="sublabel">—</span>}</td>
                      <td className="num">{p.totalPermissoes}</td>
                      <td>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                          {modulos.map((m) => (
                            <span key={m} className="pill mute" style={{ fontSize: 10 }}>{m}</span>
                          ))}
                          {!modulos.length && <span className="sublabel">Sem permissões</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!perfis.length && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-st">
                        <h4>Nenhum perfil criado</h4>
                        <p>Crie o primeiro perfil de acesso.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>
      )}

      {/* Invite drawer */}
      {inviteOpen && (
        <>
          <div className="drawer-bd" onClick={closeInvite} />
          <aside className="drawer" aria-label="Convidar colaborador">
            <div className="drawer-head">
              <div>
                <h2>Convidar colaborador</h2>
                <p className="erp-page-sub">O acesso será criado com senha temporária &quot;change-me&quot;.</p>
              </div>
              <button type="button" className="btn-erp ghost sm" onClick={closeInvite}>Fechar</button>
            </div>
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
                    <small className="hint">Crie ao menos um perfil antes de convidar colaboradores.</small>
                  )}
                </label>
              </div>
              {inviteError && <div className="alert danger" style={{ margin: "0 16px 16px" }}><span>{inviteError}</span></div>}
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn-erp ghost sm" onClick={closeInvite}>Cancelar</button>
              <button type="button" className="btn-erp primary sm" disabled={inviteSaving} onClick={saveInvite}>
                {inviteSaving ? "Salvando..." : "Convidar"}
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Perfil drawer */}
      {perfilOpen && (
        <>
          <div className="drawer-bd" onClick={closePerfil} />
          <aside className="drawer" aria-label="Novo perfil">
            <div className="drawer-head">
              <div>
                <h2>Novo perfil de acesso</h2>
                <p className="erp-page-sub">Defina o nome e selecione as permissões por módulo.</p>
              </div>
              <button type="button" className="btn-erp ghost sm" onClick={closePerfil}>Fechar</button>
            </div>
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

              <div style={{ padding: "4px 20px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--erp-slate)", marginBottom: 8 }}>Permissões por módulo</div>
                <div className="erp-table-wrap solo">
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

              {perfilError && <div className="alert danger" style={{ margin: "0 16px 16px" }}><span>{perfilError}</span></div>}
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn-erp ghost sm" onClick={closePerfil}>Cancelar</button>
              <button type="button" className="btn-erp primary sm" disabled={perfilSaving} onClick={savePerfil}>
                {perfilSaving ? "Salvando..." : "Criar perfil"}
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
