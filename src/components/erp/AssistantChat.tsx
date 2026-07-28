"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONAS } from "@/domains/agent/runtime/persona";
import type { AgentRole, AgentDraft, AgentQuickAction } from "@/domains/agent/types";
import styles from "./AssistantChat.module.css";

type ChatMsg = {
  id?: string;
  papel: "user" | "assistant";
  texto: string;
  createdAt?: string;
  anexo?: string;
  audioUrl?: string;
  draft?: AgentDraft | null;
  quickActions?: AgentQuickAction[];
};

type ConversationSummary = {
  id: string;
  title: string;
  role: AgentRole;
  status: "ATIVA" | "ENCERRADA";
  createdAt: string;
  updatedAt: string;
  preview: string;
};

const ROLES: Array<{ id: AgentRole; label: string }> = [
  { id: "GESTOR", label: "Gestor" },
  { id: "VENDEDOR", label: "Vendedor" }
];

const SUGGESTION_ICONS = ["chart", "box", "wallet", "sparkles"] as const;

type IconName =
  | "arrowUp"
  | "attachment"
  | "box"
  | "chart"
  | "check"
  | "history"
  | "mic"
  | "plus"
  | "sparkles"
  | "stop"
  | "wallet";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrowUp: <><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>,
    attachment: <path d="m20.5 11.5-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9" />,
    box: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v9" /><path d="m21 12-9 5-9-5" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m7 16 4-5 4 3 5-7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v5" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    sparkles: <><path d="m12 3-1.1 3.4a6 6 0 0 1-3.8 3.8L4 11.3l3.1 1a6 6 0 0 1 3.8 3.8L12 20l1.1-3.9a6 6 0 0 1 3.8-3.8l3.1-1-3.1-1.1a6 6 0 0 1-3.8-3.8L12 3Z" /><path d="m5 3 .4 1.2A2 2 0 0 0 6.8 5.6L8 6l-1.2.4a2 2 0 0 0-1.4 1.4L5 9l-.4-1.2a2 2 0 0 0-1.4-1.4L2 6l1.2-.4a2 2 0 0 0 1.4-1.4L5 3Z" /></>,
    stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
    wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6" /><path d="M16 14h.01" /></>
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function formatRecordingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function FormattedMessage({ text }: { text: string }) {
  return (
    <span className={styles.messageText}>
      {text.split(/(\*\*.*?\*\*)/g).map((part, index) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={index}>{part.slice(2, -2)}</strong>
          : <span key={index}>{part}</span>
      )}
    </span>
  );
}

export function AssistantChat() {
  const [role, setRole] = useState<AgentRole>("GESTOR");
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [conversationStatus, setConversationStatus] = useState<"ATIVA" | "ENCERRADA" | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [mensagens, setMensagens] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const localAudioUrlsRef = useRef<Set<string>>(new Set());

  const persona = PERSONAS[role];

  async function carregarHistorico(selectedId?: string | null) {
    setLoadingHistory(true);
    try {
      const query = selectedId ? `?conversaId=${encodeURIComponent(selectedId)}` : "";
      const res = await fetch(`/api/erp/assistente/chat${query}`, { cache: "no-store" });
      const data = (await res.json()) as {
        conversations?: ConversationSummary[];
        selectedConversation?: {
          id: string;
          role: AgentRole;
          status: "ATIVA" | "ENCERRADA";
        } | null;
        messages?: ChatMsg[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar o histórico.");
      setConversations(data.conversations ?? []);
      setConversaId(data.selectedConversation?.id ?? null);
      setConversationStatus(data.selectedConversation?.status ?? null);
      if (data.selectedConversation?.role) setRole(data.selectedConversation.role);
      setMensagens(data.messages ?? []);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar o histórico.");
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void carregarHistorico();
  }, []);

  useEffect(() => {
    const localAudioUrls = localAudioUrlsRef.current;
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
      localAudioUrls.forEach((url) => URL.revokeObjectURL(url));
      localAudioUrls.clear();
    };
  }, []);

  useEffect(() => {
    if (!recording) {
      setRecordingSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

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
        if (blob.size) {
          const audioFile = new File([blob], `audio-${Date.now()}.${extension}`, { type: mimeType });
          void enviar(input, audioFile);
        }
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
      if (conversaId && conversationStatus === "ATIVA") {
        const res = await fetch("/api/erp/assistente/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversaId, role, acao: "finalizar" })
        });
        if (!res.ok) throw new Error("Não foi possível encerrar a conversa atual.");
      }
      setRole(novo);
      setConversaId(null);
      setConversationStatus(null);
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
      if (conversaId && conversationStatus === "ATIVA") {
        const res = await fetch("/api/erp/assistente/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversaId, role, acao: "finalizar" })
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Não foi possível encerrar a conversa.");
      }
      setConversaId(null);
      setConversationStatus(null);
      setMensagens([]);
      setInput("");
      setAttachment(null);
      setHistoryOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar uma nova conversa.");
    } finally {
      setBusy(false);
    }
  }

  async function enviar(texto: string, explicitAttachment?: File) {
    const msg = texto.trim();
    const currentAttachment = explicitAttachment ?? attachment;
    if ((!msg && !currentAttachment) || busy || recording || conversationStatus === "ENCERRADA") return;
    const isAudioMessage = Boolean(currentAttachment?.type.startsWith("audio/"));
    let localAudioUrl: string | undefined;
    if (isAudioMessage && currentAttachment) {
      localAudioUrl = URL.createObjectURL(currentAttachment);
      localAudioUrlsRef.current.add(localAudioUrl);
    }
    setError("");
    setInput("");
    setMensagens((cur) => [
      ...cur.map((message) => ({ ...message, quickActions: undefined })),
      {
        papel: "user",
        texto: msg || (isAudioMessage ? "Mensagem de voz" : "Anexo enviado"),
        anexo: isAudioMessage ? undefined : currentAttachment?.name,
        audioUrl: localAudioUrl
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
        assistantAudioBase64?: string | null;
        assistantAudioMime?: string | null;
        showAssistantText?: boolean;
        quickActions?: AgentQuickAction[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Não foi possível obter a resposta.");
      if (data.conversationEnded) {
        setConversaId(null);
        setConversationStatus(null);
      } else if (data.conversaId) {
        setConversaId(data.conversaId);
        setConversationStatus("ATIVA");
      }
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const assistantAudioUrl = data.assistantAudioBase64
        ? `data:${data.assistantAudioMime || "audio/mpeg"};base64,${data.assistantAudioBase64}`
        : undefined;
      setMensagens((cur) => [
        ...cur,
        {
          papel: "assistant",
          texto: data.showAssistantText === false && assistantAudioUrl ? "" : (data.assistantText ?? ""),
          audioUrl: assistantAudioUrl,
          draft: data.draft ?? null,
          quickActions: data.quickActions ?? []
        }
      ]);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao conversar com o assistente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Inteligência</span>
            <span className={styles.breadcrumbDot} />
            <span>Assistente</span>
          </div>
          <h1 className={styles.pageTitle}>
            Assistente de IA <span>que entende seu negócio.</span>
          </h1>
          <p className={styles.pageDescription}>
            Consulte, analise e execute tarefas usando os dados reais da sua empresa.
          </p>
        </div>
        <div className={styles.livePill}>
          <span className={styles.liveDot} />
          IA conectada
        </div>
      </header>

      <section className={styles.chatShell}>
        <div className={styles.ambientGlow} aria-hidden="true" />
        <header className={styles.chatHeader}>
          <div className={styles.identity}>
            <div className={styles.avatar}>
              <Icon name="sparkles" size={21} />
              <span className={styles.avatarPulse} />
            </div>
            <div>
              <strong>{persona.titulo}</strong>
              <span>
                <i />
                Pronto para ajudar
              </span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.roleSwitch} aria-label="Perfil do assistente">
              {ROLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={role === item.id ? styles.roleActive : undefined}
                  onClick={() => void trocarRole(item.id)}
                  disabled={busy}
                  aria-pressed={role === item.id}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.historyButton}
              onClick={() => {
                const nextOpen = !historyOpen;
                setHistoryOpen(nextOpen);
                if (nextOpen) void carregarHistorico(conversaId);
              }}
              disabled={busy}
              aria-expanded={historyOpen}
              aria-label="Histórico de conversas"
            >
              <Icon name="history" size={17} />
              <span>Histórico</span>
            </button>
            <button
              type="button"
              className={styles.newChatButton}
              onClick={novaConversa}
              disabled={busy || (!conversaId && mensagens.length === 0)}
            >
              <Icon name="plus" size={17} />
              <span>Nova conversa</span>
            </button>
          </div>
        </header>

        {historyOpen && (
          <aside className={styles.historyPanel} aria-label="Histórico de conversas">
            <div className={styles.historyPanelHeader}>
              <div>
                <strong>Suas conversas</strong>
                <span>As últimas 30 ficam salvas</span>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Fechar histórico">×</button>
            </div>
            <div className={styles.historyList}>
              {loadingHistory && <span className={styles.historyEmpty}>Carregando conversas…</span>}
              {!loadingHistory && conversations.length === 0 && (
                <span className={styles.historyEmpty}>Nenhuma conversa salva ainda.</span>
              )}
              {!loadingHistory && conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`${styles.historyItem} ${conversation.id === conversaId ? styles.historyItemActive : ""}`}
                  onClick={() => {
                    void carregarHistorico(conversation.id);
                    setHistoryOpen(false);
                  }}
                >
                  <span className={styles.historyItemTop}>
                    <strong>{conversation.title}</strong>
                    <i className={conversation.status === "ATIVA" ? styles.activeStatus : undefined}>
                      {conversation.status === "ATIVA" ? "Ativa" : "Encerrada"}
                    </i>
                  </span>
                  <span>{conversation.preview || "Conversa sem prévia"}</span>
                  <time>{new Date(conversation.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>
                </button>
              ))}
            </div>
          </aside>
        )}

        <div ref={listRef} className={styles.messageList}>
          {!loadingHistory && mensagens.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.aiOrb} aria-hidden="true">
                <span className={styles.orbRing} />
                <span className={styles.orbCore}><Icon name="sparkles" size={30} /></span>
              </div>
              <span className={styles.emptyEyebrow}>Seu copiloto de negócios</span>
              <h2>O que vamos resolver hoje?</h2>
              <p>{persona.descricao}</p>
              <div className={styles.suggestionGrid}>
                {persona.sugestoes.map((suggestion, index) => (
                  <button
                    key={suggestion}
                    type="button"
                    className={styles.suggestionCard}
                    onClick={() => enviar(suggestion)}
                    disabled={busy}
                  >
                    <span className={styles.suggestionIcon}>
                      <Icon name={SUGGESTION_ICONS[index % SUGGESTION_ICONS.length]} size={19} />
                    </span>
                    <span>{suggestion}</span>
                    <span className={styles.suggestionArrow}>↗</span>
                  </button>
                ))}
              </div>
              <div className={styles.capabilities}>
                <span><Icon name="check" size={14} /> Dados em tempo real</span>
                <span><Icon name="check" size={14} /> Ações com confirmação</span>
                <span><Icon name="check" size={14} /> Texto, voz e arquivos</span>
              </div>
            </div>
          )}

          {mensagens.map((message, index) => {
            const userMessage = message.papel === "user";
            return (
              <article
                key={index}
                className={`${styles.messageRow} ${userMessage ? styles.userRow : styles.assistantRow}`}
              >
                {!userMessage && (
                  <div className={styles.messageAvatar}><Icon name="sparkles" size={16} /></div>
                )}
                <div className={styles.messageContent}>
                  <div className={styles.messageMeta}>
                    <strong>{userMessage ? "Você" : persona.titulo}</strong>
                    <span>
                      {message.createdAt
                        ? new Date(message.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                        : "agora"}
                    </span>
                  </div>
                  <div className={`${styles.bubble} ${userMessage ? styles.userBubble : styles.assistantBubble}`}>
                    {message.anexo && (
                      <span className={styles.attachmentName}>
                        <Icon name="attachment" size={15} />
                        {message.anexo}
                      </span>
                    )}
                    {message.audioUrl && (
                      <div className={styles.audioMessage}>
                        <span className={styles.audioMark}>
                          <Icon name={userMessage ? "mic" : "sparkles"} size={18} />
                        </span>
                        <div>
                          <strong>{userMessage ? "Sua mensagem de voz" : "Resposta em áudio"}</strong>
                          <audio
                            autoPlay={!userMessage}
                            controls
                            preload="metadata"
                            src={message.audioUrl}
                          />
                        </div>
                      </div>
                    )}
                    {message.texto && <FormattedMessage text={message.texto} />}
                  </div>
                  {message.draft && (
                    <a href={message.draft.href} className={styles.draftAction}>
                      <span>
                        Abrir {message.draft.tipo === "ORCAMENTO" ? "orçamento" : message.draft.tipo === "PEDIDO_VENDA" ? "no caixa" : "cadastro"}
                        {message.draft.numero ? ` ${message.draft.numero}` : ""}
                      </span>
                      <span>Confirmar agora →</span>
                    </a>
                  )}
                  {message.quickActions && message.quickActions.length > 0 && (
                    <div className={styles.quickActions} aria-label="Ações de confirmação">
                      {message.quickActions.map((action) => (
                        <button
                          key={`${action.value}-${action.label}`}
                          type="button"
                          className={`${styles.quickAction} ${
                            action.variant === "danger"
                              ? styles.quickActionDanger
                              : action.variant === "secondary"
                                ? styles.quickActionSecondary
                                : styles.quickActionPrimary
                          }`}
                          onClick={() => void enviar(action.value)}
                          disabled={busy || conversationStatus === "ENCERRADA"}
                        >
                          {action.variant === "primary" && <Icon name="check" size={16} />}
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}

          {busy && (
            <div className={`${styles.messageRow} ${styles.assistantRow}`}>
              <div className={styles.messageAvatar}><Icon name="sparkles" size={16} /></div>
              <div className={styles.thinking}>
                <span className={styles.thinkingDots}><i /><i /><i /></span>
                <span>Analisando sua solicitação</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.composerArea}>
          {conversationStatus === "ENCERRADA" && (
            <div className={styles.closedConversation}>
              <span>Esta conversa está encerrada e disponível apenas para consulta.</span>
              <button type="button" onClick={novaConversa}>Iniciar nova conversa</button>
            </div>
          )}
          {error && (
            <div className={styles.errorMessage}>
              <span>!</span>
              {error}
            </div>
          )}

          {attachment && (
            <div className={styles.attachmentPreview}>
              <span className={styles.fileIcon}><Icon name="attachment" size={17} /></span>
              <div>
                <strong>{attachment.name}</strong>
                <span>{(attachment.size / 1024).toFixed(0)} KB · pronto para enviar</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttachment(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                disabled={busy || conversationStatus === "ENCERRADA"}
                aria-label="Remover anexo"
              >
                ×
              </button>
            </div>
          )}

          <form
            className={`${styles.composer} ${recording ? styles.composerRecording : ""}`}
            onSubmit={(event) => {
              event.preventDefault();
              void enviar(input);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,audio/*,.txt,.csv,.xml,.json"
              className={styles.hiddenInput}
              onChange={(event) => escolherAnexo(event.target.files?.[0] ?? null)}
            />

            {recording ? (
              <div className={styles.recordingPanel}>
                <span className={styles.recordingDot} />
                <span className={styles.recordingTime}>{formatRecordingTime(recordingSeconds)}</span>
                <div className={styles.waveform} aria-hidden="true">
                  {Array.from({ length: 19 }, (_, index) => <i key={index} />)}
                </div>
                <span className={styles.recordingHint}>Gravando sua mensagem…</span>
              </div>
            ) : (
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void enviar(input);
                  }
                }}
                rows={1}
                placeholder={attachment ? "Dê uma instrução para o arquivo (opcional)" : "Converse com sua empresa…"}
                disabled={busy || conversationStatus === "ENCERRADA"}
                aria-label="Mensagem para o assistente"
              />
            )}

            <div className={styles.composerTools}>
              {!recording && (
                <button
                  type="button"
                  className={styles.toolButton}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy || conversationStatus === "ENCERRADA"}
                  title="Anexar imagem, PDF, áudio ou arquivo"
                  aria-label="Anexar arquivo"
                >
                  <Icon name="attachment" size={19} />
                </button>
              )}
              <button
                type="button"
                className={`${styles.toolButton} ${recording ? styles.stopButton : styles.micButton}`}
                onClick={() => void alternarGravacao()}
                disabled={busy || conversationStatus === "ENCERRADA"}
                title={recording ? "Parar e enviar" : "Gravar áudio"}
                aria-label={recording ? "Parar e enviar áudio" : "Gravar áudio"}
              >
                <Icon name={recording ? "stop" : "mic"} size={19} />
                {recording && <span>Parar e enviar</span>}
              </button>
              {!recording && (
                <button
                  type="submit"
                  className={styles.sendButton}
                  disabled={busy || conversationStatus === "ENCERRADA" || (!input.trim() && !attachment)}
                  title="Enviar mensagem"
                  aria-label="Enviar mensagem"
                >
                  <Icon name="arrowUp" size={20} />
                </button>
              )}
            </div>
          </form>
          <div className={styles.composerFooter}>
            <span>Enter para enviar · Shift + Enter para nova linha</span>
            <span><Icon name="sparkles" size={12} /> Respostas baseadas nos dados da empresa</span>
          </div>
        </div>
      </section>
    </main>
  );
}
