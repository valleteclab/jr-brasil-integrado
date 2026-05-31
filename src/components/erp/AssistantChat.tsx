"use client";

import { useRef, useState } from "react";
import { PERSONAS } from "@/domains/agent/runtime/persona";
import type { AgentRole, AgentDraft } from "@/domains/agent/types";

type ChatMsg = { papel: "user" | "assistant"; texto: string; draft?: AgentDraft | null };

const ROLES: Array<{ id: AgentRole; label: string }> = [
  { id: "GESTOR", label: "Gestor" },
  { id: "VENDEDOR", label: "Vendedor" }
];

export function AssistantChat() {
  const [role, setRole] = useState<AgentRole>("GESTOR");
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const persona = PERSONAS[role];

  function trocarRole(novo: AgentRole) {
    setRole(novo);
    setConversaId(null);
    setMensagens([]);
    setError("");
  }

  async function enviar(texto: string) {
    const msg = texto.trim();
    if (!msg || busy) return;
    setError("");
    setInput("");
    setMensagens((cur) => [...cur, { papel: "user", texto: msg }]);
    setBusy(true);
    try {
      const res = await fetch("/api/erp/assistente/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId, role, mensagem: msg })
      });
      const data = (await res.json()) as { conversaId?: string; assistantText?: string; draft?: AgentDraft | null; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível obter a resposta.");
      if (data.conversaId) setConversaId(data.conversaId);
      setMensagens((cur) => [...cur, { papel: "assistant", texto: data.assistantText ?? "", draft: data.draft ?? null }]);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao conversar com o assistente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div className="erp-page-head">
        <div>
          <div className="erp-crumbs">Inteligência <span className="sep">/</span> Assistente</div>
          <h1 className="erp-page-title">Assistente de IA</h1>
          <p className="erp-page-sub">{persona.descricao}</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {ROLES.map((r) => (
            <button key={r.id} type="button" className={`btn-erp ${role === r.id ? "primary" : "ghost"} sm`} onClick={() => trocarRole(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="erp-card" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 240px)", minHeight: 420 }}>
        <div ref={listRef} className="erp-card-body" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {mensagens.length === 0 && (
            <div className="empty-st" style={{ margin: "auto", textAlign: "center" }}>
              <h4>Como posso ajudar?</h4>
              <p>Escolha uma sugestão ou escreva sua pergunta.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 10 }}>
                {persona.sugestoes.map((s) => (
                  <button key={s} type="button" className="btn-erp light sm" onClick={() => enviar(s)} disabled={busy}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {mensagens.map((m, i) => (
            <div key={i} style={{ alignSelf: m.papel === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontSize: 13.5,
                  whiteSpace: "pre-wrap",
                  background: m.papel === "user" ? "var(--erp-yellow, #ffc107)" : "var(--erp-surface, #f4f5f7)",
                  color: m.papel === "user" ? "#1a1a1a" : "inherit"
                }}
              >
                {m.texto}
              </div>
              {m.draft && (
                <a
                  href={m.draft.href}
                  className="btn-erp primary sm"
                  style={{ marginTop: 6, display: "inline-block", textDecoration: "none" }}
                >
                  Abrir {m.draft.tipo === "ORCAMENTO" ? "orçamento" : m.draft.tipo === "PEDIDO_VENDA" ? "no caixa" : "cadastro"}
                  {m.draft.numero ? ` ${m.draft.numero}` : ""} para confirmar →
                </a>
              )}
            </div>
          ))}
          {busy && <div style={{ alignSelf: "flex-start", fontSize: 12.5, color: "var(--erp-mute)" }}>Pensando…</div>}
        </div>

        {error && <div className="alert danger" style={{ margin: "0 12px 8px" }}><span>{error}</span></div>}

        <form
          className="erp-card-body"
          style={{ display: "flex", gap: 8, borderTop: "1px solid var(--erp-line)" }}
          onSubmit={(e) => { e.preventDefault(); enviar(input); }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escreva sua mensagem…"
            style={{ flex: 1, height: 40, padding: "0 12px", border: "1px solid var(--erp-line)", borderRadius: 8, fontSize: 13.5 }}
            disabled={busy}
          />
          <button type="submit" className="btn-erp primary" disabled={busy || !input.trim()}>Enviar</button>
        </form>
      </div>
    </div>
  );
}
