"use client";

import { useEffect, useState } from "react";

/** Painel do SDR outbound: cadência, janela, limites, templates e teste real. */

type Config = {
  ativo: boolean; limiteDia: number; porExecucao: number; horaInicio: number; horaFim: number;
  somenteDiasUteis: boolean; maxToques: number; diasEntreToques: number;
  toque1: string; toque2: string; toque3: string;
};
type Status = { config: Config; enviadosHoje: number; filaNovos: number; emCadencia: number; responderam: number };

export function ProspeccaoAtivaPanel() {
  const [st, setSt] = useState<Status | null>(null);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [telTeste, setTelTeste] = useState("");

  async function carregar() {
    try {
      const res = await fetch("/api/admin/prospeccao");
      const data = (await res.json()) as Status & { error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao carregar.");
      setSt(data);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
  }
  useEffect(() => { void carregar(); }, []);

  function upd(patch: Partial<Config>) {
    setSt((cur) => (cur ? { ...cur, config: { ...cur.config, ...patch } } : cur));
  }

  async function salvar() {
    if (!st) return;
    setSalvando(true); setErro(""); setOk("");
    try {
      const res = await fetch("/api/admin/prospeccao", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(st.config)
      });
      const data = (await res.json()) as Status & { error?: string };
      if (!res.ok) throw new Error(data.error || "Falha ao salvar.");
      setSt(data); setOk("Configuração salva.");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setSalvando(false); }
  }

  async function acao(acao: "teste" | "rodar") {
    setErro(""); setOk("");
    try {
      const res = await fetch("/api/admin/prospeccao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acao === "teste" ? { acao, telefone: telTeste } : { acao })
      });
      const data = (await res.json()) as { error?: string; enviados?: number; motivo?: string; ok?: boolean };
      if (!res.ok) throw new Error(data.error || "Falha na ação.");
      setOk(acao === "teste" ? "🧪 Teste enviado! Confere teu WhatsApp." : `Ciclo executado: ${data.enviados ?? 0} envio(s)${data.motivo ? ` · ${data.motivo}` : ""}`);
      void carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha na ação."); }
  }

  if (!st) return <section className="erp-card" style={{ marginTop: 18, padding: 16 }}>{erro || "Carregando prospecção…"}</section>;
  const c = st.config;

  return (
    <section className="erp-card" style={{ marginTop: 18 }}>
      <div className="erp-card-head">
        <h3>🎯 Prospecção ativa (SDR de IA)</h3>
        <span style={{ fontSize: 12.5, color: "var(--erp-mute, #64748b)" }}>
          aborda os leads importados no WhatsApp; quem responde cai no agente de IA automaticamente
        </span>
      </div>

      <div className="kpi-row" style={{ padding: "0 16px" }}>
        <div className="calc-box"><span className="calc-label">Enviados hoje</span><span className="calc-value">{st.enviadosHoje} / {c.limiteDia}</span></div>
        <div className="calc-box"><span className="calc-label">Fila (1º toque)</span><span className="calc-value">{st.filaNovos}</span></div>
        <div className="calc-box"><span className="calc-label">Em cadência</span><span className="calc-value">{st.emCadencia}</span></div>
        <div className="calc-box"><span className="calc-label">Responderam</span><span className="calc-value">{st.responderam}</span></div>
      </div>

      <div className="erp-form">
        <label className="check-row">
          <input type="checkbox" checked={c.ativo} onChange={(e) => upd({ ativo: e.target.checked })} />
          <strong>{c.ativo ? "LIGADA — enviando na janela configurada" : "DESLIGADA"}</strong>
        </label>
        <label>Limite por dia<input inputMode="numeric" value={String(c.limiteDia)} onChange={(e) => upd({ limiteDia: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
        <label>Envios por ciclo (5 min)<input inputMode="numeric" value={String(c.porExecucao)} onChange={(e) => upd({ porExecucao: Number(e.target.value.replace(/\D/g, "")) || 1 })} /></label>
        <label>Janela — início (h)<input inputMode="numeric" value={String(c.horaInicio)} onChange={(e) => upd({ horaInicio: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
        <label>Janela — fim (h)<input inputMode="numeric" value={String(c.horaFim)} onChange={(e) => upd({ horaFim: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
        <label>Dias entre toques<input inputMode="numeric" value={String(c.diasEntreToques)} onChange={(e) => upd({ diasEntreToques: Number(e.target.value.replace(/\D/g, "")) || 1 })} /></label>
        <label className="check-row">
          <input type="checkbox" checked={c.somenteDiasUteis} onChange={(e) => upd({ somenteDiasUteis: e.target.checked })} />
          Somente dias úteis
        </label>
        <label className="full">Toque 1 — abertura ({"{empresa} {segmento} {dor} {presente} {agente}"})<textarea rows={4} value={c.toque1} onChange={(e) => upd({ toque1: e.target.value })} /></label>
        <label className="full">Toque 2 — lembrete<textarea rows={3} value={c.toque2} onChange={(e) => upd({ toque2: e.target.value })} /></label>
        <label className="full">Toque 3 — último (com saída educada)<textarea rows={3} value={c.toque3} onChange={(e) => upd({ toque3: e.target.value })} /></label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 16px", flexWrap: "wrap" }}>
        <button type="button" className="btn-erp primary" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar configuração"}</button>
        <button type="button" className="btn-erp light" onClick={() => void acao("rodar")}>▶ Rodar 1 ciclo agora</button>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input placeholder="Seu WhatsApp p/ teste (DDD+número)" value={telTeste} onChange={(e) => setTelTeste(e.target.value)} style={{ width: 220 }} />
          <button type="button" className="btn-erp ghost" onClick={() => void acao("teste")}>🧪 Enviar teste</button>
        </span>
        {erro && <span style={{ color: "var(--erp-danger, #dc2626)", fontSize: 13 }}>{erro}</span>}
        {ok && <span style={{ color: "var(--erp-success, #16a34a)", fontSize: 13 }}>{ok}</span>}
      </div>
    </section>
  );
}
