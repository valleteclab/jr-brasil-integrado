"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime/useRealtime";

/**
 * PAINEL DA OFICINA (TV de parede): ordens de serviço em aberto agrupadas por status, em quadro
 * kanban fullscreen. Atualiza em TEMPO REAL por SSE (canal "oficina") — quando alguém muda uma OS
 * no ERP, a TV reflete em ~1s — com polling de segurança a cada 30s caso o SSE caia.
 */

type OrdemPainel = {
  id: string;
  numero: string;
  status: string;
  equipamento: string;
  placa: string | null;
  problema: string | null;
  cliente: string;
  tecnico: string | null;
  previsaoEm: string | null;
  criadoEm: string;
  atrasada: boolean;
};

type PainelData = { ordens: OrdemPainel[]; contagem: Record<string, number>; ts: number };

const COLUNAS: { status: string; titulo: string; cor: string }[] = [
  { status: "ABERTA", titulo: "Aguardando início", cor: "#3b82f6" },
  { status: "AGUARDANDO_PECAS", titulo: "Aguardando peças", cor: "#f59e0b" },
  { status: "EM_ANDAMENTO", titulo: "Em andamento", cor: "#22c55e" },
  { status: "FINALIZADA_NAO_FATURADA", titulo: "Pronto p/ entrega", cor: "#a855f7" }
];

function tempoDesde(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 1 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

function previsaoLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function OficinaPainel({ inicial, empresaNome }: { inicial: PainelData | null; empresaNome: string }) {
  const [data, setData] = useState<PainelData | null>(inicial);
  const [relogio, setRelogio] = useState<string>("");
  const [aoVivo, setAoVivo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/erp/oficina/painel", { cache: "no-store" });
      if (!res.ok) return;
      const nova = (await res.json()) as PainelData;
      setData(nova);
      setAoVivo(true);
    } catch {
      setAoVivo(false);
    }
  }, []);

  // Tempo real (SSE) + polling de segurança a cada 30s.
  useRealtime(["oficina"], carregar);
  useEffect(() => {
    const t = setInterval(carregar, 30_000);
    return () => clearInterval(t);
  }, [carregar]);

  // Relógio grande no cabeçalho (atualiza a cada segundo).
  useEffect(() => {
    const tick = () => setRelogio(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function alternarFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    } else {
      await containerRef.current?.requestFullscreen().catch(() => undefined);
    }
  }

  const ordens = data?.ordens ?? [];
  const totalAtrasadas = ordens.filter((o) => o.atrasada).length;

  return (
    <div ref={containerRef} style={{ minHeight: "100vh", background: "#0b1220", color: "#e6ebf5", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* Cabeçalho */}
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 24px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 0.5 }}>Painel da Oficina</div>
          <div style={{ fontSize: 14, color: "#94a3b8" }}>{empresaNome} · {ordens.length} OS em aberto{totalAtrasadas > 0 ? ` · ${totalAtrasadas} atrasada(s)` : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: aoVivo ? "#22c55e" : "#f59e0b" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: aoVivo ? "#22c55e" : "#f59e0b", boxShadow: aoVivo ? "0 0 10px #22c55e" : "none" }} />
          {aoVivo ? "AO VIVO" : "reconectando…"}
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, fontVariantNumeric: "tabular-nums", minWidth: 140, textAlign: "right" }}>{relogio}</div>
        <button
          type="button"
          onClick={alternarFullscreen}
          style={{ background: "#1e293b", color: "#e6ebf5", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 14, cursor: "pointer" }}
        >
          {fullscreen ? "↙ Sair" : "⛶ Tela cheia"}
        </button>
      </header>

      {/* Colunas (kanban) */}
      <main style={{ flex: 1, display: "grid", gridTemplateColumns: `repeat(${COLUNAS.length}, 1fr)`, gap: 12, padding: 16, overflow: "hidden" }}>
        {COLUNAS.map((col) => {
          const doStatus = ordens.filter((o) => o.status === col.status);
          return (
            <section key={col.status} style={{ display: "flex", flexDirection: "column", background: "#0f1a2e", borderRadius: 12, border: "1px solid #1e293b", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: `3px solid ${col.cor}` }}>
                <span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{col.titulo}</span>
                <span style={{ background: col.cor, color: "#0b1220", fontWeight: 800, borderRadius: 999, padding: "2px 12px", fontSize: 16 }}>{doStatus.length}</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                {doStatus.map((os) => (
                  <article
                    key={os.id}
                    style={{
                      background: os.atrasada ? "#3b1518" : "#16233c",
                      border: `1px solid ${os.atrasada ? "#ef4444" : "#243657"}`,
                      borderRadius: 10,
                      padding: "12px 14px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: col.cor }}>#{os.numero}</span>
                      {os.placa && <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1, color: "#cbd5e1" }}>{os.placa}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b" }}>há {tempoDesde(os.criadoEm)}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{os.equipamento}</div>
                    <div style={{ fontSize: 14, color: "#94a3b8" }}>{os.cliente}{os.tecnico ? ` · 👨‍🔧 ${os.tecnico}` : ""}</div>
                    {os.problema && <div style={{ fontSize: 13, color: "#7c8aa5", marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{os.problema}</div>}
                    {os.previsaoEm && (
                      <div style={{ fontSize: 13, marginTop: 6, color: os.atrasada ? "#fca5a5" : "#7c8aa5", fontWeight: os.atrasada ? 700 : 400 }}>
                        {os.atrasada ? "⚠ Atrasada · previsão " : "⏱ Previsão "}{previsaoLabel(os.previsaoEm)}
                      </div>
                    )}
                  </article>
                ))}
                {doStatus.length === 0 && <div style={{ color: "#475569", fontSize: 14, textAlign: "center", padding: 20 }}>—</div>}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
