"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRealtime } from "@/lib/realtime/useRealtime";

/**
 * Widget de COMUNICAÇÃO INTERNA na topbar: sino de notificações + chat 1-a-1 entre usuários.
 * Tempo real via SSE (canais "notificacoes" e "chat") — sem polling agressivo; recarrega ao sinal.
 */

type Notif = { id: string; tipo: string; titulo: string; mensagem: string; link: string | null; lida: boolean; criadoEm: string };
type Contato = { id: string; nome: string; perfil: string; naoLidas: number };
type MsgChat = { id: string; minha: boolean; texto: string; criadoEm: string };

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ComunicacaoWidget() {
  const [aberto, setAberto] = useState<null | "notif" | "chat">(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [naoLidasNotif, setNaoLidasNotif] = useState(0);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [chatNaoLido, setChatNaoLido] = useState(0);
  const [conversaCom, setConversaCom] = useState<Contato | null>(null);
  const [mensagens, setMensagens] = useState<MsgChat[]>([]);
  const [texto, setTexto] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/erp/comunicacao");
      const d = (await res.json().catch(() => ({}))) as { notificacoes?: { itens: Notif[]; naoLidas: number }; contatos?: Contato[]; chatNaoLido?: number };
      if (res.ok) {
        setNotifs(d.notificacoes?.itens ?? []);
        setNaoLidasNotif(d.notificacoes?.naoLidas ?? 0);
        setContatos(d.contatos ?? []);
        setChatNaoLido(d.chatNaoLido ?? 0);
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const abrirConversa = useCallback(async (c: Contato) => {
    setConversaCom(c);
    try {
      const res = await fetch(`/api/erp/comunicacao/chat/${c.id}`);
      const d = (await res.json().catch(() => ({}))) as { mensagens?: MsgChat[] };
      setMensagens(d.mensagens ?? []);
      void carregar();
      setTimeout(() => fimRef.current?.scrollIntoView(), 50);
    } catch { /* silencioso */ }
  }, [carregar]);

  // Tempo real: ao sinal, recarrega o resumo e (se numa conversa) as mensagens.
  useRealtime(["notificacoes", "chat"], () => {
    void carregar();
    if (conversaCom) void abrirConversa(conversaCom);
  });

  async function marcarNotif(id?: string) {
    await fetch("/api/erp/comunicacao/notificacoes/marcar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    void carregar();
  }

  async function enviar() {
    if (!conversaCom || !texto.trim()) return;
    const t = texto.trim();
    setTexto("");
    try {
      const res = await fetch(`/api/erp/comunicacao/chat/${conversaCom.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t }) });
      const d = (await res.json().catch(() => ({}))) as { mensagem?: MsgChat };
      if (res.ok && d.mensagem) { setMensagens((cur) => [...cur, d.mensagem!]); setTimeout(() => fimRef.current?.scrollIntoView(), 30); }
    } catch { /* silencioso */ }
  }

  const painel = { position: "absolute" as const, top: 40, right: 0, width: 340, maxHeight: 460, overflow: "auto", background: "#fff", border: "1px solid var(--erp-line, #e2e8f0)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,.15)", zIndex: 50, padding: 8 };

  return (
    <>
      {/* Sino de notificações */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button type="button" className="erp-top-btn" aria-label="Notificações" onClick={() => setAberto(aberto === "notif" ? null : "notif")}>
          🔔{naoLidasNotif > 0 && <span style={badge}>{naoLidasNotif}</span>}
        </button>
        {aberto === "notif" && (
          <div style={painel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px" }}>
              <strong>Notificações</strong>
              {naoLidasNotif > 0 && <button type="button" className="btn-erp ghost xs" onClick={() => marcarNotif()}>Marcar todas lidas</button>}
            </div>
            {!notifs.length && <div className="block-muted" style={{ padding: 10, fontSize: 13 }}>Nenhuma notificação.</div>}
            {notifs.map((n) => (
              <a key={n.id} href={n.link ?? "#"} onClick={() => marcarNotif(n.id)} style={{ display: "block", padding: 8, borderRadius: 8, background: n.lida ? "transparent" : "var(--erp-bg, #f8fafc)", textDecoration: "none", color: "inherit", marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: n.lida ? 400 : 700 }}>{n.titulo}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{n.mensagem}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{hora(n.criadoEm)}</div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Chat interno */}
      <div style={{ position: "relative", display: "inline-block" }}>
        <button type="button" className="erp-top-btn" aria-label="Chat interno" onClick={() => { setAberto(aberto === "chat" ? null : "chat"); setConversaCom(null); }}>
          💬{chatNaoLido > 0 && <span style={badge}>{chatNaoLido}</span>}
        </button>
        {aberto === "chat" && (
          <div style={{ ...painel, width: 360, display: "flex", flexDirection: "column", padding: 0 }}>
            {!conversaCom ? (
              <>
                <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--erp-line, #eee)" }}><strong>Chat interno</strong></div>
                {!contatos.length && <div className="block-muted" style={{ padding: 10, fontSize: 13 }}>Nenhum colega cadastrado nesta empresa.</div>}
                {contatos.map((c) => (
                  <button key={c.id} type="button" onClick={() => abrirConversa(c)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid var(--erp-line, #f1f5f9)", cursor: "pointer", textAlign: "left" }}>
                    <span><span style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</span><br /><span style={{ fontSize: 11, color: "#94a3b8" }}>{c.perfil}</span></span>
                    {c.naoLidas > 0 && <span style={badge}>{c.naoLidas}</span>}
                  </button>
                ))}
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--erp-line, #eee)" }}>
                  <button type="button" className="btn-erp ghost xs" onClick={() => setConversaCom(null)}>←</button>
                  <strong>{conversaCom.nome}</strong>
                </div>
                <div style={{ flex: 1, overflow: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6, maxHeight: 320 }}>
                  {mensagens.map((m) => (
                    <div key={m.id} style={{ alignSelf: m.minha ? "flex-end" : "flex-start", maxWidth: "80%", background: m.minha ? "var(--jr-yellow, #2563eb)" : "#f1f5f9", color: m.minha ? "#fff" : "#0f172a", padding: "6px 10px", borderRadius: 10, fontSize: 13 }}>
                      {m.texto}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{hora(m.criadoEm)}</div>
                    </div>
                  ))}
                  {!mensagens.length && <div className="block-muted" style={{ fontSize: 13 }}>Comece a conversa.</div>}
                  <div ref={fimRef} />
                </div>
                <div style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid var(--erp-line, #eee)" }}>
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void enviar(); } }} placeholder="Mensagem…" style={{ flex: 1, height: 34 }} />
                  <button type="button" className="btn-erp primary sm" onClick={enviar} disabled={!texto.trim()}>Enviar</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const badge: CSSProperties = { position: "absolute", top: -4, right: -4, background: "#dc2626", color: "#fff", borderRadius: 10, fontSize: 10, minWidth: 16, height: 16, lineHeight: "16px", textAlign: "center", padding: "0 4px", fontWeight: 700 };
