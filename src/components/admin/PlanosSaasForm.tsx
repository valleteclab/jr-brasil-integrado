"use client";

import { useState } from "react";
import type { PlanoSaasRow } from "@/lib/services/platform-admin";

/** Edição dos planos do SaaS: mensalidade, limite de notas/mês e trial — tudo pelo dono, sem código. */
export function PlanosSaasForm({ planos }: { planos: PlanoSaasRow[] }) {
  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      {planos.map((p) => <PlanoCardEdit key={p.codigo} plano={p} />)}
    </div>
  );
}

function PlanoCardEdit({ plano }: { plano: PlanoSaasRow }) {
  const [nome, setNome] = useState(plano.nome);
  const [descricao, setDescricao] = useState(plano.descricao ?? "");
  const [preco, setPreco] = useState(plano.precoMensal);
  const [limite, setLimite] = useState<string>(plano.limiteNotasMes == null ? "" : String(plano.limiteNotasMes));
  const [trial, setTrial] = useState(plano.trialDias);
  const [ativo, setAtivo] = useState(plano.ativo);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  async function salvar() {
    setBusy(true); setMsg(""); setErro("");
    try {
      const res = await fetch("/api/admin/planos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: plano.codigo,
          nome,
          descricao: descricao || null,
          precoMensal: Number(preco) || 0,
          limiteNotasMes: limite.trim() === "" ? null : Math.max(1, Number(limite) || 0),
          trialDias: Number(trial) || 0,
          ativo
        })
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "Falha ao salvar.");
      setMsg("Plano salvo.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  const campo = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13 };

  return (
    <div className="erp-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 15 }}>{plano.codigo === "EMISSOR" ? "🧾" : "🏢"} {plano.codigo}</strong>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo
        </label>
      </div>
      {msg && <div className="alert success">{msg}</div>}
      {erro && <div className="alert danger">{erro}</div>}
      <label style={campo}>Nome comercial
        <input value={nome} onChange={(e) => setNome(e.target.value)} style={{ height: 34 }} />
      </label>
      <label style={campo}>Descrição (aparece no cadastro/venda)
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
      </label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={campo}>Mensalidade (R$)
          <input type="number" min={0} step="0.01" value={preco} onChange={(e) => setPreco(Number(e.target.value) || 0)} style={{ width: 120, height: 34, textAlign: "right" }} />
        </label>
        <label style={campo}>Notas/mês (vazio = ilimitado)
          <input type="number" min={1} value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="∞" style={{ width: 140, height: 34, textAlign: "right" }} />
        </label>
        <label style={campo}>Trial (dias)
          <input type="number" min={0} value={trial} onChange={(e) => setTrial(Number(e.target.value) || 0)} style={{ width: 100, height: 34, textAlign: "right" }} />
        </label>
      </div>
      <div>
        <button type="button" className="btn-erp primary sm" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : "Salvar plano"}</button>
      </div>
    </div>
  );
}
