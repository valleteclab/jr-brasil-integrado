"use client";

import { useState } from "react";
import type { ProvedorFiscalAmbiente } from "@/lib/services/platform-admin";

const ROTULO: Record<string, string> = { HOMOLOGACAO: "Homologação", PRODUCAO: "Produção" };

function CardAmbiente({ inicial }: { inicial: ProvedorFiscalAmbiente }) {
  const [baseUrl, setBaseUrl] = useState(inicial.baseUrl);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [configurado, setConfigurado] = useState(inicial.configurado);
  const [clientIdFinal, setClientIdFinal] = useState(inicial.clientIdFinal);
  const [secretFinal, setSecretFinal] = useState(inicial.secretFinal);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  async function salvar() {
    setSalvando(true);
    setMsg("");
    setErro("");
    try {
      const res = await fetch("/api/admin/provedor-fiscal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ambiente: inicial.ambiente,
          baseUrl: baseUrl.trim() || undefined,
          clientId: clientId.trim() || undefined,
          clientSecret: clientSecret.trim() || undefined,
          ativo
        })
      });
      const data = (await res.json().catch(() => ({}))) as { ambientes?: ProvedorFiscalAmbiente[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      const atualizado = data.ambientes?.find((a) => a.ambiente === inicial.ambiente);
      if (atualizado) {
        setConfigurado(atualizado.configurado);
        setClientIdFinal(atualizado.clientIdFinal);
        setSecretFinal(atualizado.secretFinal);
        setBaseUrl(atualizado.baseUrl);
      }
      setClientId("");
      setClientSecret("");
      setMsg("Credenciais salvas.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="erp-card" style={{ padding: 16 }}>
      <div className="erp-card-head" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>{ROTULO[inicial.ambiente] ?? inicial.ambiente}</h3>
          <span className={`status-badge ${configurado ? "success" : "mute"}`}>
            {configurado ? "Configurado" : "Não configurado"}
          </span>
        </div>
      </div>

      <div className="erp-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="full">
          URL base da API
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://hom.acbr.api.br" />
        </label>
        <label>
          Client ID{clientIdFinal ? ` (salvo: …${clientIdFinal})` : ""}
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={clientIdFinal ? "•••• manter atual" : "client_id"} autoComplete="off" />
        </label>
        <label>
          Client Secret{secretFinal ? ` (salvo: …${secretFinal})` : ""}
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={secretFinal ? "•••• manter atual" : "client_secret"} autoComplete="new-password" />
        </label>
        <label className="full" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} style={{ width: "auto" }} />
          Ambiente ativo
        </label>
        <div className="full" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" className="btn-erp primary sm" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          {msg && <span style={{ color: "var(--erp-success, #16a34a)", fontSize: 13 }}>{msg}</span>}
          {erro && <span style={{ color: "var(--erp-danger, #dc2626)", fontSize: 13 }}>{erro}</span>}
        </div>
      </div>
      <small className="field-hint" style={{ display: "block", marginTop: 8 }}>
        Deixe Client ID/Secret em branco para manter os atuais. Só preencha para trocar.
      </small>
    </section>
  );
}

export function ProvedorFiscalForm({ ambientes }: { ambientes: ProvedorFiscalAmbiente[] }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {ambientes.map((a) => (
        <CardAmbiente key={a.ambiente} inicial={a} />
      ))}
    </div>
  );
}
