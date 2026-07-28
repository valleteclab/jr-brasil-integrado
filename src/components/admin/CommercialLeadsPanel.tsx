"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";

const STATUS = [
  "NOVO",
  "EM_CONVERSA",
  "QUALIFICADO",
  "DEMONSTRACAO",
  "TESTE",
  "PROPOSTA",
  "ASSINANTE",
  "NUTRICAO",
  "PERDIDO",
  "OPT_OUT"
] as const;

const LABELS: Record<string, string> = {
  NOVO: "Novo",
  EM_CONVERSA: "Em conversa",
  QUALIFICADO: "Qualificado",
  DEMONSTRACAO: "Demonstração",
  TESTE: "Em teste",
  PROPOSTA: "Proposta",
  ASSINANTE: "Assinante",
  NUTRICAO: "Nutrição",
  PERDIDO: "Perdido",
  OPT_OUT: "Não contatar"
};

type LeadRow = {
  id: string;
  nome: string | null;
  empresa: string | null;
  telefone: string | null;
  email: string | null;
  segmento: string | null;
  status: string;
  canalOrigem: string;
  origem: string | null;
  campanha: string | null;
  score: number;
  precisaHumano: boolean;
  ultimoContatoEm: string | null;
  proximoFollowupEm: string | null;
  atualizadoEm: string;
  ultimaInteracao: string | null;
};

type LeadDetail = LeadRow & {
  dorPrincipal?: string | null;
  observacoes?: string | null;
  interacoes: Array<{
    id: string;
    direcao: "ENTRADA" | "SAIDA" | "INTERNA";
    canal: string;
    tipo: string;
    conteudo: string;
    criadoEm: string;
  }>;
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function statusTone(status: string): "success" | "danger" | "info" | "warn" | "mute" {
  if (status === "ASSINANTE" || status === "QUALIFICADO") return "success";
  if (status === "PERDIDO" || status === "OPT_OUT") return "danger";
  if (status === "TESTE" || status === "DEMONSTRACAO") return "info";
  if (status === "PROPOSTA" || status === "NUTRICAO") return "warn";
  return "mute";
}

export function CommercialLeadsPanel({ initialLeads }: { initialLeads: LeadRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return initialLeads.filter((lead) => {
      if (status && lead.status !== status) return false;
      if (!query) return true;
      return [lead.nome, lead.empresa, lead.telefone, lead.email, lead.segmento]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [initialLeads, search, status]);

  async function openLead(id: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/leads/${id}`, { cache: "no-store" });
      const data = (await response.json()) as LeadDetail & { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao carregar o lead.");
      setSelected({
        ...data,
        atualizadoEm: new Date(data.atualizadoEm).toISOString(),
        ultimoContatoEm: data.ultimoContatoEm ? new Date(data.ultimoContatoEm).toISOString() : null,
        proximoFollowupEm: data.proximoFollowupEm ? new Date(data.proximoFollowupEm).toISOString() : null,
        interacoes: data.interacoes.map((item) => ({ ...item, criadoEm: new Date(item.criadoEm).toISOString() }))
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o lead.");
    } finally {
      setLoading(false);
    }
  }

  async function saveLead() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/leads/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: selected.nome,
          empresa: selected.empresa,
          telefone: selected.telefone,
          email: selected.email,
          segmento: selected.segmento,
          status: selected.status,
          score: selected.score,
          dorPrincipal: selected.dorPrincipal,
          observacoes: selected.observacoes,
          precisaHumano: selected.precisaHumano,
          proximoFollowupEm: selected.proximoFollowupEm
        })
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao salvar o lead.");
      router.refresh();
      setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar o lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="erp-card" style={{ padding: 14 }}>
        <div className="erp-toolbar" style={{ marginBottom: 12 }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar nome, empresa, telefone ou segmento"
            style={{ minWidth: 320 }}
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos os status</option>
            {STATUS.map((item) => <option key={item} value={item}>{LABELS[item]}</option>)}
          </select>
          <span className="block-muted">{filtered.length} lead(s)</span>
        </div>
        {error && <div className="alert danger" style={{ marginBottom: 10 }}><span>{error}</span></div>}
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Origem</th>
                <th>Status</th>
                <th className="num">Score</th>
                <th>Última conversa</th>
                <th>Atualizado</th>
                <th className="actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7}>Nenhum lead encontrado.</td></tr>}
              {filtered.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.nome || lead.empresa || lead.telefone || lead.email || "Lead sem nome"}</strong>
                    <small style={{ display: "block", color: "var(--erp-mute)" }}>
                      {[lead.empresa && lead.empresa !== lead.nome ? lead.empresa : null, lead.telefone, lead.segmento].filter(Boolean).join(" · ")}
                    </small>
                    {lead.precisaHumano && <div style={{ marginTop: 4 }}><StatusBadge tone="warn">Pediu atendimento humano</StatusBadge></div>}
                  </td>
                  <td>
                    <span>{lead.canalOrigem.replaceAll("_", " ")}</span>
                    <small style={{ display: "block", color: "var(--erp-mute)" }}>{lead.campanha || lead.origem || "Direto"}</small>
                  </td>
                  <td><StatusBadge tone={statusTone(lead.status)}>{LABELS[lead.status] || lead.status}</StatusBadge></td>
                  <td className="num"><strong>{lead.score}</strong></td>
                  <td style={{ maxWidth: 340 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.ultimaInteracao || "Sem conversa"}
                    </span>
                    {lead.proximoFollowupEm && <small style={{ color: "var(--jr-warn)" }}>Follow-up: {formatDate(lead.proximoFollowupEm)}</small>}
                  </td>
                  <td>{formatDate(lead.atualizadoEm)}</td>
                  <td className="actions">
                    <button type="button" className="btn-erp light sm" onClick={() => void openLead(lead.id)} disabled={loading}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(14,17,23,.42)", zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
          <aside className="erp-form" style={{ width: "min(620px, 100%)", height: "100%", background: "#fff", padding: 20, overflowY: "auto", boxShadow: "-20px 0 50px rgba(0,0,0,.16)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <small className="block-muted">Lead comercial</small>
                <h2 style={{ margin: 0 }}>{selected.nome || selected.empresa || selected.telefone || "Lead"}</h2>
              </div>
              <button type="button" className="btn-erp ghost icon-only" onClick={() => setSelected(null)}>×</button>
            </div>

            <div className="form-grid two">
              <label>Nome<input value={selected.nome ?? ""} onChange={(e) => setSelected({ ...selected, nome: e.target.value })} /></label>
              <label>Empresa<input value={selected.empresa ?? ""} onChange={(e) => setSelected({ ...selected, empresa: e.target.value })} /></label>
              <label>WhatsApp<input value={selected.telefone ?? ""} onChange={(e) => setSelected({ ...selected, telefone: e.target.value })} /></label>
              <label>E-mail<input value={selected.email ?? ""} onChange={(e) => setSelected({ ...selected, email: e.target.value })} /></label>
              <label>Segmento<input value={selected.segmento ?? ""} onChange={(e) => setSelected({ ...selected, segmento: e.target.value })} /></label>
              <label>Status
                <select value={selected.status} onChange={(e) => setSelected({ ...selected, status: e.target.value })}>
                  {STATUS.map((item) => <option key={item} value={item}>{LABELS[item]}</option>)}
                </select>
              </label>
              <label>Score<input type="number" min={0} max={100} value={selected.score} onChange={(e) => setSelected({ ...selected, score: Number(e.target.value) })} /></label>
              <label>Próximo follow-up
                <input
                  type="datetime-local"
                  value={selected.proximoFollowupEm ? selected.proximoFollowupEm.slice(0, 16) : ""}
                  onChange={(e) => setSelected({ ...selected, proximoFollowupEm: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </label>
            </div>
            <label style={{ display: "flex", gap: 8, margin: "12px 0" }}>
              <input type="checkbox" checked={selected.precisaHumano} onChange={(e) => setSelected({ ...selected, precisaHumano: e.target.checked })} />
              Precisa de atendimento humano
            </label>
            <label>Dor principal<textarea rows={3} value={selected.dorPrincipal ?? ""} onChange={(e) => setSelected({ ...selected, dorPrincipal: e.target.value })} /></label>
            <label>Observações internas<textarea rows={3} value={selected.observacoes ?? ""} onChange={(e) => setSelected({ ...selected, observacoes: e.target.value })} /></label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, margin: "14px 0 22px" }}>
              <button type="button" className="btn-erp light" onClick={() => setSelected(null)}>Cancelar</button>
              <button type="button" className="btn-erp primary" onClick={() => void saveLead()} disabled={saving}>
                {saving ? "Salvando…" : "Salvar lead"}
              </button>
            </div>

            <h3>Linha do tempo</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selected.interacoes.length === 0 && <span className="block-muted">Sem interações registradas.</span>}
              {selected.interacoes.map((interaction) => (
                <div key={interaction.id} style={{ border: "1px solid var(--erp-line)", borderRadius: 10, padding: 10, background: interaction.direcao === "ENTRADA" ? "#fff" : interaction.direcao === "SAIDA" ? "#fff9e6" : "#f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontSize: 11 }}>{interaction.direcao === "ENTRADA" ? "Lead" : interaction.direcao === "SAIDA" ? "Agente XERP" : "Equipe"}</strong>
                    <small className="block-muted">{formatDate(interaction.criadoEm)}</small>
                  </div>
                  <span style={{ whiteSpace: "pre-wrap" }}>{interaction.conteudo}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
