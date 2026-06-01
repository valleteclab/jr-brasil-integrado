"use client";

import { useMemo, useState } from "react";
import type { ColaboradorSummary, PerfilSummary } from "@/lib/services/team";
import { MODULOS as CATALOGO_MODULOS, type ModuloKey } from "@/lib/auth/modules";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Catálogo de módulos do RBAC (mesma fonte do menu/gate). O acesso é por MÓDULO
// (ação "acessar"): se o módulo está marcado, o perfil enxerga aquela área.
const MODULOS = CATALOGO_MODULOS.map((m) => m.key);
const MODULO_LABELS: Record<ModuloKey, string> = Object.fromEntries(
  CATALOGO_MODULOS.map((m) => [m.key, m.label])
) as Record<ModuloKey, string>;

type Modulo = ModuloKey;

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
  /** Módulos que o perfil pode acessar. */
  modulos: Set<Modulo>;
};

type TeamManagerProps = {
  initialColaboradores: ColaboradorSummary[];
  initialPerfis: PerfilSummary[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyPerfilForm(): PerfilForm {
  return { nome: "", descricao: "", modulos: new Set<Modulo>() };
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
  const [editingPerfilId, setEditingPerfilId] = useState<string | null>(null);
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
      const data = await response.json() as { id?: string; senhaTemporaria?: string | null; error?: string };

      if (!response.ok) throw new Error(data.error ?? "Não foi possível convidar o colaborador.");

      if (data.senhaTemporaria) {
        window.alert(
          `Colaborador criado.\n\nSenha temporária: ${data.senhaTemporaria}\n\nRepasse ao colaborador — ele deve trocá-la após o primeiro login.`
        );
      }

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
    setEditingPerfilId(null);
    setPerfilForm(emptyPerfilForm());
    setPerfilError("");
    setPerfilOpen(true);
  }

  function openEditPerfil(p: PerfilSummary) {
    const modulos = new Set<Modulo>(
      p.permissoes.filter((pm) => pm.acao === "acessar").map((pm) => pm.modulo as Modulo)
    );
    setEditingPerfilId(p.id);
    setPerfilForm({ nome: p.nome, descricao: p.descricao ?? "", modulos });
    setPerfilError("");
    setPerfilOpen(true);
  }

  function closePerfil() {
    setPerfilOpen(false);
    setEditingPerfilId(null);
    setPerfilError("");
  }

  function toggleModulo(modulo: Modulo) {
    setPerfilForm((prev) => {
      const next = new Set(prev.modulos);
      if (next.has(modulo)) next.delete(modulo);
      else next.add(modulo);
      return { ...prev, modulos: next };
    });
  }

  function toggleTodosModulos() {
    setPerfilForm((prev) => {
      const todos = prev.modulos.size === MODULOS.length;
      return { ...prev, modulos: todos ? new Set<Modulo>() : new Set<Modulo>(MODULOS) };
    });
  }

  async function savePerfil() {
    if (!perfilForm.nome.trim()) { setPerfilError("Nome do perfil é obrigatório."); return; }
    if (perfilForm.modulos.size === 0) { setPerfilError("Selecione ao menos um módulo."); return; }

    // RBAC por módulo: uma permissão (modulo, acao "acessar") por módulo marcado.
    const permissoes = Array.from(perfilForm.modulos).map((m) => ({ modulo: m, acao: "acessar" }));

    setPerfilSaving(true);
    setPerfilError("");

    try {
      if (editingPerfilId) {
        // Edição: atualiza apenas os módulos de acesso do perfil existente.
        const response = await fetch(`/api/erp/perfis/${editingPerfilId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modulos: Array.from(perfilForm.modulos) })
        });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o perfil.");
        setPerfis((prev) =>
          prev.map((p) => p.id === editingPerfilId ? { ...p, totalPermissoes: permissoes.length, permissoes } : p)
        );
      } else {
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
      }
      closePerfil();
    } catch (err) {
      setPerfilError(err instanceof Error ? err.message : "Erro ao salvar o perfil.");
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
                  <th className="num">Módulos</th>
                  <th>Acesso aos módulos</th>
                  <th className="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {perfis.map((p) => {
                  const modulos = Array.from(new Set(p.permissoes.filter((pm) => pm.acao === "acessar").map((pm) => pm.modulo)));
                  const admin = ["SUPER_ADMIN", "COMPANY_ADMIN", "TENANT_ADMIN"].includes(p.nome.toUpperCase());
                  return (
                    <tr key={p.id}>
                      <td><div style={{ fontWeight: 600, fontSize: 13 }}>{p.nome}</div></td>
                      <td>{p.descricao ?? <span className="sublabel">—</span>}</td>
                      <td className="num">{admin ? "Todos" : modulos.length}</td>
                      <td>
                        {admin ? (
                          <span className="pill success" style={{ fontSize: 10 }}>Acesso total</span>
                        ) : (
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                            {modulos.map((m) => (
                              <span key={m} className="pill mute" style={{ fontSize: 10 }}>{MODULO_LABELS[m as ModuloKey] ?? m}</span>
                            ))}
                            {!modulos.length && <span className="sublabel">Sem acesso</span>}
                          </div>
                        )}
                      </td>
                      <td className="actions">
                        <button type="button" className="btn-erp ghost xs" onClick={() => openEditPerfil(p)}>Editar</button>
                      </td>
                    </tr>
                  );
                })}
                {!perfis.length && (
                  <tr>
                    <td colSpan={5}>
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
                <p className="erp-page-sub">Uma senha temporária será gerada e exibida para você repassar ao colaborador.</p>
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
          <aside className="drawer" aria-label={editingPerfilId ? "Editar perfil" : "Novo perfil"}>
            <div className="drawer-head">
              <div>
                <h2>{editingPerfilId ? "Editar perfil de acesso" : "Novo perfil de acesso"}</h2>
                <p className="erp-page-sub">Marque os módulos que este perfil pode acessar.</p>
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
                    disabled={Boolean(editingPerfilId)}
                    onChange={(e) => setPerfilForm((prev) => ({ ...prev, nome: e.target.value }))}
                  />
                </label>
                {!editingPerfilId && (
                  <label className="full">
                    Descrição
                    <input
                      value={perfilForm.descricao}
                      onChange={(e) => setPerfilForm((prev) => ({ ...prev, descricao: e.target.value }))}
                    />
                  </label>
                )}
              </div>

              <div style={{ padding: "4px 20px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--erp-slate)" }}>Módulos que o perfil acessa</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={perfilForm.modulos.size === MODULOS.length}
                      onChange={toggleTodosModulos}
                    />
                    Selecionar todos
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {MODULOS.map((m) => (
                    <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: `1px solid ${perfilForm.modulos.has(m) ? "var(--erp-yellow, #ffc107)" : "var(--erp-line, #e2e8f0)"}`, borderRadius: 6, cursor: "pointer", fontSize: 12.5 }}>
                      <input
                        type="checkbox"
                        checked={perfilForm.modulos.has(m)}
                        onChange={() => toggleModulo(m)}
                        aria-label={MODULO_LABELS[m]}
                      />
                      {MODULO_LABELS[m]}
                    </label>
                  ))}
                </div>
              </div>

              {perfilError && <div className="alert danger" style={{ margin: "0 16px 16px" }}><span>{perfilError}</span></div>}
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn-erp ghost sm" onClick={closePerfil}>Cancelar</button>
              <button type="button" className="btn-erp primary sm" disabled={perfilSaving} onClick={savePerfil}>
                {perfilSaving ? "Salvando..." : editingPerfilId ? "Salvar alterações" : "Criar perfil"}
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
