"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MODULOS } from "@/lib/auth/modules";

type PerfilRow = { id: string; nome: string; descricao: string | null; isAdmin: boolean; modulos: string[] };
type Props = { tenantId: string; perfis: PerfilRow[] };

const labelModulo = (key: string) => MODULOS.find((m) => m.key === key)?.label ?? key;

export function ClientePerfisManager({ tenantId, perfis }: Props) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <>
      {erro && <div className="alert danger" style={{ marginBottom: 12 }}><span>{erro}</span></div>}

      <div className="erp-page-actions" style={{ marginBottom: 12 }}>
        <Button onClick={() => { setCriando((v) => !v); setEditando(null); setErro(""); }}>
          {criando ? "Fechar" : "+ Novo perfil"}
        </Button>
      </div>

      {criando && (
        <PerfilForm
          titulo="Novo perfil"
          tenantId={tenantId}
          onErro={setErro}
          onPronto={() => { setCriando(false); router.refresh(); }}
        />
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Perfil</th>
              <th>Descrição</th>
              <th>Acesso aos módulos</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {perfis.length === 0 && <tr><td colSpan={4}>Nenhum perfil cadastrado.</td></tr>}
            {perfis.map((p) =>
              editando === p.id ? (
                <tr key={p.id}>
                  <td colSpan={4}>
                    <PerfilModulosEditor
                      perfil={p}
                      onErro={setErro}
                      onCancelar={() => setEditando(null)}
                      onPronto={() => { setEditando(null); router.refresh(); }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td><strong>{p.nome}</strong></td>
                  <td>{p.descricao ?? "—"}</td>
                  <td>
                    {p.isAdmin ? (
                      <StatusBadge tone="success">Acesso total</StatusBadge>
                    ) : p.modulos.length === 0 ? (
                      <span className="sublabel">Sem módulos</span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {p.modulos.map((m) => (
                          <span key={m} className="status-badge mute">{labelModulo(m)}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="actions">
                    <button type="button" className="btn-erp ghost sm" onClick={() => { setEditando(p.id); setCriando(false); setErro(""); }}>
                      Editar
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PerfilForm({
  titulo,
  tenantId,
  onErro,
  onPronto
}: {
  titulo: string;
  tenantId: string;
  onErro: (s: string) => void;
  onPronto: () => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [modulos, setModulos] = useState<string[]>(["dashboard"]);
  const [busy, setBusy] = useState(false);

  function toggle(key: string) {
    setModulos((ms) => (ms.includes(key) ? ms.filter((m) => m !== key) : [...ms, key]));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onErro("");
    try {
      const res = await fetch(`/api/admin/clientes/${tenantId}/perfis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, descricao: descricao || undefined, modulos })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível criar o perfil.");
      onPronto();
    } catch (e2) {
      onErro(e2 instanceof Error ? e2.message : "Não foi possível criar o perfil.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={salvar} style={{ marginBottom: 16, padding: 12, border: "1px solid var(--erp-line, #e2e8f0)", borderRadius: 8 }}>
      <h4 style={{ margin: "0 0 8px" }}>{titulo}</h4>
      <div className="form-grid two">
        <label>Nome do perfil *<input value={nome} onChange={(e) => setNome(e.target.value)} required /></label>
        <label>Descrição<input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
      </div>
      <ModulosCheckboxes selecionados={modulos} onToggle={toggle} />
      <div className="erp-page-actions" style={{ marginTop: 12 }}>
        <Button type="submit" disabled={busy}>{busy ? "Criando…" : "Criar perfil"}</Button>
      </div>
    </form>
  );
}

function PerfilModulosEditor({
  perfil,
  onErro,
  onCancelar,
  onPronto
}: {
  perfil: PerfilRow;
  onErro: (s: string) => void;
  onCancelar: () => void;
  onPronto: () => void;
}) {
  const [modulos, setModulos] = useState<string[]>(perfil.modulos);
  const [busy, setBusy] = useState(false);

  function toggle(key: string) {
    setModulos((ms) => (ms.includes(key) ? ms.filter((m) => m !== key) : [...ms, key]));
  }

  async function salvar() {
    setBusy(true);
    onErro("");
    try {
      const res = await fetch(`/api/admin/perfis/${perfil.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulos })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      onPronto();
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 4 }}>
      <h4 style={{ margin: "0 0 8px" }}>Editar acesso · {perfil.nome}</h4>
      {perfil.isAdmin && (
        <div className="alert" style={{ marginBottom: 8 }}>
          <span>Perfil administrativo: tem acesso total independentemente da seleção abaixo.</span>
        </div>
      )}
      <ModulosCheckboxes selecionados={modulos} onToggle={toggle} />
      <div className="erp-page-actions" style={{ marginTop: 12, gap: 8 }}>
        <Button type="button" onClick={salvar} disabled={busy}>{busy ? "Salvando…" : "Salvar permissões"}</Button>
        <Button type="button" variant="light" onClick={onCancelar} disabled={busy}>Cancelar</Button>
      </div>
    </div>
  );
}

function ModulosCheckboxes({ selecionados, onToggle }: { selecionados: string[]; onToggle: (key: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, marginTop: 8 }}>
      {MODULOS.map((m) => (
        <label key={m.key} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={selecionados.includes(m.key)} onChange={() => onToggle(m.key)} style={{ width: "auto" }} />
          {m.label}
        </label>
      ))}
    </div>
  );
}
