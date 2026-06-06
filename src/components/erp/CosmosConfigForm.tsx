"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";

type Initial = { configurado: boolean; ativo: boolean; chaveFinal: string | null };

export function CosmosConfigForm({ initial }: { initial: Initial }) {
  const [token, setToken] = useState("");
  const [ativo, setAtivo] = useState(initial.ativo);
  const [chaveFinal, setChaveFinal] = useState(initial.chaveFinal);
  const [configurado, setConfigurado] = useState(initial.configurado);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Teste de consulta
  const [gtinTeste, setGtinTeste] = useState("");
  const [testando, setTestando] = useState(false);
  const [resultado, setResultado] = useState<null | { descricao: string; ncm: string | null; cest: string | null; marca: string | null }>(null);
  const [erroTeste, setErroTeste] = useState("");

  async function salvar() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body: { ativo: boolean; token?: string } = { ativo };
      if (token.trim()) body.token = token.trim();
      const response = await fetch("/api/erp/configuracoes/cosmos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { ativo?: boolean; chaveFinal?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setConfigurado(true);
      setAtivo(Boolean(data.ativo));
      setChaveFinal(data.chaveFinal ?? chaveFinal);
      setToken("");
      setMessage("Configuração do Cosmos salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function testar() {
    setTestando(true);
    setErroTeste("");
    setResultado(null);
    try {
      const response = await fetch(`/api/erp/produtos/gtin/${encodeURIComponent(gtinTeste.replace(/\D/g, ""))}`);
      const data = await response.json() as { descricao?: string; ncm?: string | null; cest?: string | null; marca?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error || "Falha na consulta.");
      setResultado({ descricao: data.descricao ?? "", ncm: data.ncm ?? null, cest: data.cest ?? null, marca: data.marca ?? null });
    } catch (e) {
      setErroTeste(e instanceof Error ? e.message : "Falha na consulta.");
    } finally {
      setTestando(false);
    }
  }

  return (
    <section className="erp-card">
      <div className="erp-card-head">
        <div>
          <h3>Conexão com o Cosmos</h3>
          <span>Token de acesso à API do catálogo Bluesoft Cosmos.</span>
        </div>
        <StatusBadge tone={configurado && ativo ? "success" : "mute"}>{configurado ? (ativo ? "Ativo" : "Inativo") : "Não configurado"}</StatusBadge>
      </div>

      <div className="erp-form">
        <label className="span-2">
          Token do Cosmos {configurado && <span className="block-muted">(salvo, terminando em …{chaveFinal}). Deixe em branco para manter.</span>}
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={configurado ? "•••••••• (manter atual)" : "Cole aqui o token do Cosmos"} autoComplete="off" />
        </label>
        <label className="checkbox-line">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Integração ativa
        </label>
      </div>

      {message && <div className="alert info" style={{ margin: "0 16px 12px" }}><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger" style={{ margin: "0 16px 12px" }}><strong>Atenção</strong><span>{error}</span></div>}

      <footer className="inline-foot">
        <Button type="button" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </footer>

      <div className="erp-card-head" style={{ borderTop: "1px solid var(--erp-line)" }}>
        <div>
          <h3>Testar consulta</h3>
          <span>Informe um código de barras para validar a conexão.</span>
        </div>
      </div>
      <div className="erp-form">
        <label>
          Código de barras (GTIN/EAN)
          <input value={gtinTeste} onChange={(e) => setGtinTeste(e.target.value)} placeholder="Ex: 7891910000197" />
        </label>
        <div className="inline-foot" style={{ alignItems: "end", padding: 0 }}>
          <Button type="button" variant="light" onClick={testar} disabled={testando || !gtinTeste.trim()}>{testando ? "Consultando..." : "Testar"}</Button>
        </div>
      </div>
      {erroTeste && <div className="alert danger" style={{ margin: "0 16px 12px" }}><strong>Atenção</strong><span>{erroTeste}</span></div>}
      {resultado && (
        <div className="alert info" style={{ margin: "0 16px 16px" }}>
          <strong>{resultado.descricao || "(sem descrição)"}</strong>
          <span>NCM: {resultado.ncm ?? "-"} · CEST: {resultado.cest ?? "-"} · Marca: {resultado.marca ?? "-"}</span>
        </div>
      )}
    </section>
  );
}
