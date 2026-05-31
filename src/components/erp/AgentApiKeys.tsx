"use client";

import { useEffect, useState } from "react";

type Chave = {
  id: string;
  nome: string;
  role: "GESTOR" | "VENDEDOR" | "CLIENTE";
  chaveFinal: string;
  ativo: boolean;
  ultimoUsoEm: string | null;
  criadoEm: string;
};

/**
 * Gerencia as chaves de API do agente/MCP da empresa. A chave em claro só aparece
 * no momento da criação (não é recuperável depois) — o usuário copia e guarda.
 */
export function AgentApiKeys() {
  const [chaves, setChaves] = useState<Chave[]>([]);
  const [nome, setNome] = useState("");
  const [role, setRole] = useState<"GESTOR" | "VENDEDOR">("GESTOR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [novaChave, setNovaChave] = useState<string | null>(null);

  async function carregar() {
    try {
      const res = await fetch("/api/erp/configuracoes/agente/chaves");
      const data = (await res.json()) as { chaves?: Chave[]; error?: string };
      if (res.ok && data.chaves) setChaves(data.chaves);
    } catch {
      /* silencioso */
    }
  }
  useEffect(() => { void carregar(); }, []);

  async function criar() {
    setError("");
    setNovaChave(null);
    setBusy(true);
    try {
      const res = await fetch("/api/erp/configuracoes/agente/chaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() || "Chave do agente", role })
      });
      const data = (await res.json()) as { chave?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível criar a chave.");
      setNovaChave(data.chave ?? null);
      setNome("");
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar a chave.");
    } finally {
      setBusy(false);
    }
  }

  async function revogar(id: string) {
    if (!window.confirm("Revogar esta chave? Integrações que a usam deixarão de funcionar.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/configuracoes/agente/chaves/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Não foi possível revogar.");
      }
      await carregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível revogar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="erp-card" style={{ marginTop: 16 }}>
      <div className="erp-card-head"><h3>Chaves de API do Agente (MCP)</h3></div>
      <div className="erp-card-body">
        <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
          Crie uma chave para conectar agentes externos (Claude Desktop, outros clientes MCP) às
          ferramentas do ERP desta empresa. A chave respeita o <b>papel</b> escolhido (gestor =
          consultas/insights; vendedor = também monta rascunhos de orçamento/pré-venda). A chave em
          claro aparece <b>apenas uma vez</b> — copie e guarde.
        </p>
        {error && <div className="alert danger" style={{ marginBottom: 10 }}><span>{error}</span></div>}
        {novaChave && (
          <div className="alert success" style={{ marginBottom: 10 }}>
            <strong>Chave criada — copie agora (não será exibida de novo):</strong>
            <span className="mono" style={{ wordBreak: "break-all" }}>{novaChave}</span>
          </div>
        )}
        <div className="erp-form" style={{ gridTemplateColumns: "2fr 1fr auto", alignItems: "end" }}>
          <label>Nome da chave
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Claude Desktop do gestor" />
          </label>
          <label>Papel
            <select value={role} onChange={(e) => setRole(e.target.value as "GESTOR" | "VENDEDOR")}>
              <option value="GESTOR">Gestor (consultas/insights)</option>
              <option value="VENDEDOR">Vendedor (rascunhos)</option>
            </select>
          </label>
          <button type="button" className="btn-erp primary sm" disabled={busy} onClick={criar}>
            {busy ? "Gerando…" : "Gerar chave"}
          </button>
        </div>

        {chaves.length > 0 && (
          <div className="erp-table-wrap solo" style={{ marginTop: 12, border: 0, borderRadius: 0 }}>
            <table className="erp-table">
              <thead><tr><th>Nome</th><th>Papel</th><th>Final</th><th>Status</th><th>Último uso</th><th className="actions" /></tr></thead>
              <tbody>
                {chaves.map((c) => (
                  <tr key={c.id} className={c.ativo ? "" : "row-muted"}>
                    <td>{c.nome}</td>
                    <td>{c.role}</td>
                    <td className="mono">…{c.chaveFinal}</td>
                    <td><span className={`pill ${c.ativo ? "success" : "mute"}`}><span className="dot" />{c.ativo ? "Ativa" : "Revogada"}</span></td>
                    <td>{c.ultimoUsoEm ? new Date(c.ultimoUsoEm).toLocaleString("pt-BR") : "—"}</td>
                    <td className="actions">
                      {c.ativo && <button type="button" className="btn-erp danger xs" disabled={busy} onClick={() => revogar(c.id)}>Revogar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 11.5, color: "var(--erp-mute)", margin: "12px 0 0" }}>
          Endpoint MCP (HTTP): <span className="mono">POST /api/mcp/http</span> com header
          <span className="mono"> Authorization: Bearer &lt;chave&gt;</span>. Para Claude Desktop (stdio):
          <span className="mono"> npm run mcp:stdio</span> com <span className="mono">JRB_AGENT_API_KEY</span>.
        </p>
      </div>
    </div>
  );
}
