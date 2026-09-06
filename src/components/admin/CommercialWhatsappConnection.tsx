"use client";

import { useCallback, useEffect, useState } from "react";

export function CommercialWhatsappConnection() {
  const [status, setStatus] = useState("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async (connect = false) => {
    if (connect) { setBusy(true); setQr(null); }
    setError("");
    try {
      const response = await fetch("/api/admin/agente-comercial/conexao", { method: connect ? "POST" : "GET", cache: "no-store" });
      const data = await response.json() as { status: string; qrCode: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao consultar conexão.");
      setStatus(data.status);
      if (connect || data.status === "connected") setQr(data.qrCode);
    } catch (cause) {
      setStatus("unknown");
      setError(cause instanceof Error ? cause.message : "Falha ao consultar conexão.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (status !== "connecting") return;
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [status, refresh]);
  useEffect(() => {
    if (!qr) return;
    const timer = setTimeout(() => setQr(null), 40_000);
    return () => clearTimeout(timer);
  }, [qr]);

  return <section aria-label="Conexão do WhatsApp comercial">
    <h3>WhatsApp próprio</h3>
    <p role="status">{({ connected: "Conectado", connecting: "Aguardando conexão", disconnected: "Desconectado", loading: "Consultando conexão…", unknown: "Conexão não verificada" })[status]}</p>
    {error && <p role="alert" className="alert danger">{error}</p>}
    {status === "connecting" && !qr && !busy && <p>Se o QR Code ainda não apareceu ou expirou, clique em Gerar QR Code para tentar novamente.</p>}
    {qr && <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="QR Code para conectar o WhatsApp comercial" width={280} height={280} style={{ maxWidth: "100%", height: "auto" }} />
      <p>No WhatsApp do número comercial, abra Aparelhos conectados → Conectar um aparelho.</p>
    </>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {status !== "connected" && <button type="button" className="btn-erp primary" disabled={busy || status === "loading"} onClick={() => void refresh(true)}>{busy ? "Conectando…" : "Gerar QR Code"}</button>}
      <button type="button" className="btn-erp light" disabled={busy} onClick={() => void refresh()}>Atualizar conexão</button>
    </div>
    <p className="block-muted">Após conectar, configure a inteligência e salve com o agente ativo para responder aos interessados.</p>
    <small className="block-muted">Conexão hospedada por nós com Evolution API, via WhatsApp Web.</small>
  </section>;
}
