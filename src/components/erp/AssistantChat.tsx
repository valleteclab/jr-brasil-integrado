"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONAS } from "@/domains/agent/runtime/persona";
import type { AgentRole, AgentDraft } from "@/domains/agent/types";

type ChatMsg = { papel: "user" | "assistant"; texto: string; anexo?: string; draft?: AgentDraft | null };

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
  const [attachment, setAttachment] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);

  const persona = PERSONAS[role];

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function escolherAnexo(file: File | null) {
    setError("");
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("O anexo excede o limite de 10 MB.");
      return;
    }
    setAttachment(file);
  }

  async function alternarGravacao() {
    if (busy) return;
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("A gravação de áudio não é suportada neste navegador.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];
      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
      recorderRef.current = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) recorderChunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const extension = mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(recorderChunksRef.current, { type: mimeType });
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        recorderRef.current = null;
        recorderChunksRef.current = [];
        setRecording(false);
        if (blob.size) escolherAnexo(new File([blob], `audio-${Date.now()}.${extension}`, { type: mimeType }));
      }, { once: true });
      recorder.start();
      setRecording(true);
    } catch (e) {
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      recorderStreamRef.current = null;
      setRecording(false);
      setError(e instanceof Error ? e.message : "Não foi possível acessar o microfone.");
    }
  }

  async function trocarRole(novo: AgentRole) {
    if (novo === role || busy) return;
    setError("");
    setBusy(true);
    try {
      if (conversaId) {
        const res = await fetch("/api/erp/assistente/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversaId, role, acao: "finalizar" })
        });
        if (!res.ok) throw new Error("Não foi possível encerrar a conversa atual.");
      }
      setRole(novo);
      setConversaId(null);
      setMensagens([]);
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao trocar o perfil da conversa.");
    } finally {
      setBusy(false);
    }
  }

  async function novaConversa() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (conversaId) {
        const res = await fetch("/api/erp/assistente/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversaId, role, acao: "finalizar" })
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Não foi possível encerrar a conversa.");
      }
      setConversaId(null);
      setMensagens([]);
      setInput("");
      setAttachment(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar uma nova conversa.");
    } finally {
      setBusy(false);
    }
  }

  async function enviar(texto: string) {
    const msg = texto.trim();
    const currentAttachment = attachment;
    if ((!msg && !currentAttachment) || busy || recording) return;
    setError("");
    setInput("");
    setMensagens((cur) => [
      ...cur,
      {
        papel: "user",
        texto: msg || (currentAttachment?.type.startsWith("audio/") ? "Áudio enviado" : "Anexo enviado"),
        anexo: currentAttachment?.name
      }
    ]);
    setBusy(true);
    try {
      let requestBody: BodyInit;
      let headers: HeadersInit | undefined;
      if (currentAttachment) {
        const form = new FormData();
        if (conversaId) form.set("conversaId", conversaId);
        form.set("role", role);
        form.set("mensagem", msg);
        form.set("anexo", currentAttachment);
        requestBody = form;
      } else {
        headers = { "Content-Type": "application/json" };
        requestBody = JSON.stringify({ conversaId, role, mensagem: msg });
      }
      const res = await fetch("/api/erp/assistente/chat", {
        method: "POST",
        headers,
        body: requestBody
      });
      const data = (await res.json()) as {
        conversaId?: string;
        assistantText?: string;
        draft?: AgentDraft | null;
        conversationEnded?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Não foi possível obter a resposta.");
      if (data.conversationEnded) setConversaId(null);
      else if (data.conversaId) setConversaId(data.conversaId);
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn-erp ghost sm" onClick={novaConversa} disabled={busy || (!conversaId && mensagens.length === 0)}>
            Nova conversa
          </button>
          {ROLES.map((r) => (
            <button key={r.id} type="button" className={`btn-erp ${role === r.id ? "primary" : "ghost"} sm`} onClick={() => void trocarRole(r.id)} disabled={busy}>
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
                {m.anexo && (
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, marginBottom: 5 }}>
                    📎 {m.anexo}
                  </span>
                )}
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
          style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--erp-line)" }}
          onSubmit={(e) => { e.preventDefault(); enviar(input); }}
        >
          {attachment && (
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 8,
                background: "var(--erp-surface, #f4f5f7)",
                fontSize: 12.5
              }}
            >
              <span>📎 {attachment.name} · {(attachment.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                className="btn-erp ghost sm"
                onClick={() => {
                  setAttachment(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                disabled={busy}
              >
                Remover
              </button>
            </div>
          )}
          {recording && (
            <div style={{ width: "100%", fontSize: 12.5, color: "var(--erp-danger, #b42318)" }}>
              ● Gravando áudio… clique em Parar quando terminar.
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,audio/*,.txt,.csv,.xml,.json"
            style={{ display: "none" }}
            onChange={(event) => escolherAnexo(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="btn-erp ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || recording}
            title="Enviar imagem, PDF, áudio ou arquivo de texto"
          >
            Anexar
          </button>
          <button
            type="button"
            className={`btn-erp ${recording ? "danger" : "ghost"}`}
            onClick={() => void alternarGravacao()}
            disabled={busy}
            title={recording ? "Parar gravação" : "Gravar áudio"}
          >
            {recording ? "Parar" : "Áudio"}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={attachment ? "Escreva uma instrução para o anexo (opcional)…" : "Escreva sua mensagem…"}
            style={{ flex: "1 1 240px", height: 40, padding: "0 12px", border: "1px solid var(--erp-line)", borderRadius: 8, fontSize: 13.5 }}
            disabled={busy || recording}
          />
          <button type="submit" className="btn-erp primary" disabled={busy || recording || (!input.trim() && !attachment)}>Enviar</button>
        </form>
      </div>
    </div>
  );
}
