"use client";

import { useState } from "react";
import type { ProvedorFiscalPlataforma, ProvedorFiscalInfo, ProvedorFiscalAmbiente } from "@/lib/services/platform-admin";

const ROTULO_AMB: Record<string, string> = { HOMOLOGACAO: "Homologação", PRODUCAO: "Produção" };

function CardAmbiente({ provedor, cred, inicial }: { provedor: string; cred: "oauth" | "token"; inicial: ProvedorFiscalAmbiente }) {
  const [baseUrl, setBaseUrl] = useState(inicial.baseUrl);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [token, setToken] = useState("");
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [estado, setEstado] = useState({ configurado: inicial.configurado, clientIdFinal: inicial.clientIdFinal, secretFinal: inicial.secretFinal, tokenFinal: inicial.tokenFinal });
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
          provedor,
          ambiente: inicial.ambiente,
          baseUrl: baseUrl.trim() || undefined,
          clientId: clientId.trim() || undefined,
          clientSecret: clientSecret.trim() || undefined,
          token: token.trim() || undefined,
          ativo
        })
      });
      const data = (await res.json().catch(() => ({}))) as { provedores?: ProvedorFiscalInfo[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      const atualizado = data.provedores?.find((p) => p.key === provedor)?.ambientes.find((a) => a.ambiente === inicial.ambiente);
      if (atualizado) {
        setEstado({ configurado: atualizado.configurado, clientIdFinal: atualizado.clientIdFinal, secretFinal: atualizado.secretFinal, tokenFinal: atualizado.tokenFinal });
        setBaseUrl(atualizado.baseUrl);
      }
      setClientId("");
      setClientSecret("");
      setToken("");
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
          <h4 style={{ margin: 0 }}>{ROTULO_AMB[inicial.ambiente] ?? inicial.ambiente}</h4>
          <span className={`status-badge ${estado.configurado ? "success" : "mute"}`}>
            {estado.configurado ? "Configurado" : "Não configurado"}
          </span>
        </div>
      </div>

      <div className="erp-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <label className="full">
          URL base da API
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" />
        </label>

        {cred === "oauth" ? (
          <>
            <label>
              Client ID{estado.clientIdFinal ? ` (salvo: …${estado.clientIdFinal})` : ""}
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={estado.clientIdFinal ? "•••• manter atual" : "client_id"} autoComplete="off" />
            </label>
            <label>
              Client Secret{estado.secretFinal ? ` (salvo: …${estado.secretFinal})` : ""}
              <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={estado.secretFinal ? "•••• manter atual" : "client_secret"} autoComplete="new-password" />
            </label>
          </>
        ) : (
          <label className="full">
            Token / Chave de API{estado.tokenFinal ? ` (salvo: …${estado.tokenFinal})` : ""}
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={estado.tokenFinal ? "•••• manter atual" : "token da API"} autoComplete="new-password" />
          </label>
        )}

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
    </section>
  );
}

export function ProvedorFiscalForm({ dados }: { dados: ProvedorFiscalPlataforma }) {
  const [provedorAtivo, setProvedorAtivo] = useState(dados.provedorAtivo);
  const [selecionado, setSelecionado] = useState(dados.provedorAtivo);
  const [ativando, setAtivando] = useState(false);
  const [erroAtivo, setErroAtivo] = useState("");

  const provedor = dados.provedores.find((p) => p.key === selecionado) ?? dados.provedores[0];

  async function tornarAtivo() {
    setAtivando(true);
    setErroAtivo("");
    try {
      const res = await fetch("/api/admin/provedor-fiscal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provedor: selecionado })
      });
      const data = (await res.json().catch(() => ({}))) as { provedorAtivo?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível ativar.");
      setProvedorAtivo(data.provedorAtivo ?? selecionado);
    } catch (e) {
      setErroAtivo(e instanceof Error ? e.message : "Não foi possível ativar.");
    } finally {
      setAtivando(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="erp-card" style={{ padding: 16 }}>
        <div className="erp-card-head" style={{ marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Provedor</h3>
            <span>Provedor ativo: <strong>{dados.provedores.find((p) => p.key === provedorAtivo)?.label ?? provedorAtivo}</strong></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {dados.provedores.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setSelecionado(p.key)}
              className={`btn-erp sm ${selecionado === p.key ? "primary" : "ghost"}`}
            >
              {p.label}
              {provedorAtivo === p.key && " ✓"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
          {provedorAtivo === selecionado ? (
            <span className="status-badge success">Este é o provedor ativo</span>
          ) : (
            <button type="button" className="btn-erp primary sm" onClick={tornarAtivo} disabled={ativando}>
              {ativando ? "Ativando…" : `Tornar "${provedor.label}" o provedor ativo`}
            </button>
          )}
          {erroAtivo && <span style={{ color: "var(--erp-danger, #dc2626)", fontSize: 13 }}>{erroAtivo}</span>}
        </div>
      </section>

      <h3 style={{ margin: "4px 0" }}>Credenciais do {provedor.label}</h3>
      {provedor.ambientes.map((a) => (
        <CardAmbiente key={`${provedor.key}-${a.ambiente}`} provedor={provedor.key} cred={provedor.cred} inicial={a} />
      ))}
    </div>
  );
}
