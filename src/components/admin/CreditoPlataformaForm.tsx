"use client";

import { useEffect, useState } from "react";
import type { CreditoPlataformaAdmin } from "@/lib/services/credito-plataforma-admin";

/** Config de plataforma do módulo de crédito: Asaas (recargas) + ApiBrasil (bureau) + preços. */
export function CreditoPlataformaForm({ dados }: { dados: CreditoPlataformaAdmin }) {
  const [estado, setEstado] = useState(dados);
  const [asaasKey, setAsaasKey] = useState("");
  const [asaasWallet, setAsaasWallet] = useState(dados.asaasWalletId ?? "");
  const [asaasSandbox, setAsaasSandbox] = useState(dados.asaasSandbox);
  const [apiToken, setApiToken] = useState("");
  const [devicePF, setDevicePF] = useState(dados.apibrasilDevicePF ?? "");
  const [devicePJ, setDevicePJ] = useState(dados.apibrasilDevicePJ ?? "");
  const [tipoPF, setTipoPF] = useState(dados.apibrasilTipoPF ?? "");
  const [tipoPJ, setTipoPJ] = useState(dados.apibrasilTipoPJ ?? "");
  const [apiSandbox, setApiSandbox] = useState(dados.apibrasilSandbox);
  const [precoPF, setPrecoPF] = useState(dados.precoConsultaPF);
  const [precoPJ, setPrecoPJ] = useState(dados.precoConsultaPJ);
  const [validade, setValidade] = useState(dados.validadeConsultaDias);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [webhook, setWebhook] = useState("");
  // Cortesia: liberar créditos na carteira de um tenant (sem Pix).
  const [carteiras, setCarteiras] = useState<Array<{ tenantId: string; nome: string; saldo: number }>>([]);
  const [tenantSel, setTenantSel] = useState("");
  const [valorCortesia, setValorCortesia] = useState(50);
  const [motivoCortesia, setMotivoCortesia] = useState("");
  const [liberando, setLiberando] = useState(false);

  async function carregarCarteiras() {
    try {
      const res = await fetch("/api/admin/credito?carteiras=1");
      const d = (await res.json().catch(() => ({}))) as { carteiras?: Array<{ tenantId: string; nome: string; saldo: number }> };
      if (res.ok && d.carteiras) setCarteiras(d.carteiras);
    } catch { /* ignora */ }
  }
  useEffect(() => { void carregarCarteiras(); }, []);

  async function liberarCreditos() {
    if (!tenantSel) { setErro("Escolha o cliente."); return; }
    if (!(valorCortesia > 0)) { setErro("Informe um valor maior que zero."); return; }
    setLiberando(true); setErro(""); setMsg("");
    try {
      const res = await fetch("/api/admin/credito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "liberar-creditos", tenantId: tenantSel, valor: valorCortesia, motivo: motivoCortesia || "Cortesia" })
      });
      const d = (await res.json().catch(() => ({}))) as { saldo?: number; error?: string };
      if (!res.ok) throw new Error(d.error || "Falha ao liberar créditos.");
      setMsg(`Créditos liberados. Novo saldo do cliente: R$ ${(d.saldo ?? 0).toFixed(2)}.`);
      setMotivoCortesia("");
      await carregarCarteiras();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao liberar créditos.");
    } finally {
      setLiberando(false);
    }
  }

  async function salvar() {
    setSalvando(true); setMsg(""); setErro("");
    try {
      const res = await fetch("/api/admin/credito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asaasApiKey: asaasKey || undefined,
          asaasWalletId: asaasWallet,
          asaasSandbox,
          apibrasilToken: apiToken || undefined,
          apibrasilDevicePF: devicePF,
          apibrasilDevicePJ: devicePJ,
          apibrasilTipoPF: tipoPF,
          apibrasilTipoPJ: tipoPJ,
          apibrasilSandbox: apiSandbox,
          precoConsultaPF: precoPF,
          precoConsultaPJ: precoPJ,
          validadeConsultaDias: validade
        })
      });
      const d = (await res.json().catch(() => ({}))) as CreditoPlataformaAdmin & { error?: string };
      if (!res.ok) throw new Error(d.error || "Falha ao salvar.");
      setEstado(d);
      setAsaasKey(""); setApiToken("");
      setMsg("Configuração salva.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function registrarWebhook() {
    setErro(""); setMsg("");
    try {
      const res = await fetch("/api/admin/credito", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "registrar-webhook" }) });
      const d = (await res.json().catch(() => ({}))) as { webhook?: string; error?: string };
      if (!res.ok) throw new Error(d.error || "Falha ao registrar o webhook.");
      setWebhook(d.webhook ?? "");
      setMsg("Webhook registrado no Asaas.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha.");
    }
  }

  const campo = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 13 };
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      {msg && <div className="alert success">{msg}</div>}
      {erro && <div className="alert danger">{erro}</div>}

      <div className="erp-card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Asaas — cobrança das recargas {estado.asaasConfigurado ? <span className="pill success"><span className="dot" />configurado</span> : <span className="pill warn"><span className="dot" />não configurado</span>}</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={campo}>Chave de API (deixe vazio p/ manter)
            <input type="password" value={asaasKey} onChange={(e) => setAsaasKey(e.target.value)} placeholder="$aact_..." style={{ height: 34 }} />
          </label>
          <label style={campo}>Wallet ID
            <input value={asaasWallet} onChange={(e) => setAsaasWallet(e.target.value)} style={{ height: 34 }} />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={asaasSandbox} onChange={(e) => setAsaasSandbox(e.target.checked)} /> Sandbox (homologação)
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="btn-erp light sm" onClick={registrarWebhook}>Registrar webhook</button>
            {estado.temWebhook && <small className="block-muted">webhook ativo</small>}
          </div>
          {webhook && <small className="block-muted" style={{ wordBreak: "break-all" }}>{webhook}</small>}
        </div>
      </div>

      <div className="erp-card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>ApiBrasil — bureau de crédito {estado.apibrasilConfigurado ? <span className="pill success"><span className="dot" />configurado</span> : <span className="pill warn"><span className="dot" />não configurado</span>}</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={campo}>Bearer Token (aba Credenciais) — vazio p/ manter
            <input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} style={{ height: 34 }} />
          </label>
          <p className="block-muted" style={{ margin: "2px 0", fontSize: 12 }}>
            Copie do painel ApiBrasil (aba do produto → “testar requisição”): a <strong>URL</strong> e o campo <strong>tipo</strong> do corpo.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ ...campo, flex: "2 1 260px" }}>Endpoint PF (CPF)
              <input value={devicePF} onChange={(e) => setDevicePF(e.target.value)} placeholder="https://gateway.apibrasil.io/api/v2/consulta/cpf/credits" style={{ height: 34 }} />
            </label>
            <label style={{ ...campo, flex: "1 1 180px" }}>tipo PF
              <input value={tipoPF} onChange={(e) => setTipoPF(e.target.value)} placeholder="boa-vista-acerta-pf" style={{ height: 34 }} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label style={{ ...campo, flex: "2 1 260px" }}>Endpoint PJ (CNPJ)
              <input value={devicePJ} onChange={(e) => setDevicePJ(e.target.value)} placeholder="https://gateway.apibrasil.io/api/v2/quod/cnpj/credits" style={{ height: 34 }} />
            </label>
            <label style={{ ...campo, flex: "1 1 180px" }}>tipo PJ
              <input value={tipoPJ} onChange={(e) => setTipoPJ(e.target.value)} placeholder="quod-pj (ou o do SQOD)" style={{ height: 34 }} />
            </label>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={apiSandbox} onChange={(e) => setApiSandbox(e.target.checked)} /> Sandbox (homologação)
          </label>
        </div>
      </div>

      <div className="erp-card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Preços de revenda e cache</h3>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={campo}>Consulta PF (R$)
            <input type="number" min={0} step="0.01" value={precoPF} onChange={(e) => setPrecoPF(Number(e.target.value) || 0)} style={{ width: 130, height: 34, textAlign: "right" }} />
          </label>
          <label style={campo}>Consulta PJ (R$)
            <input type="number" min={0} step="0.01" value={precoPJ} onChange={(e) => setPrecoPJ(Number(e.target.value) || 0)} style={{ width: 130, height: 34, textAlign: "right" }} />
          </label>
          <label style={campo}>Validade do cache (dias)
            <input type="number" min={1} value={validade} onChange={(e) => setValidade(Number(e.target.value) || 60)} style={{ width: 130, height: 34, textAlign: "right" }} />
          </label>
        </div>
      </div>

      <div className="erp-card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Liberar créditos (cortesia)</h3>
        <p className="block-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Adiciona créditos de consulta na carteira de um cliente <strong>sem Pix</strong> (bônus, plano incluso, teste). Aparece no histórico dele como recarga confirmada.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ ...campo, flex: "2 1 240px" }}>Cliente
            <select value={tenantSel} onChange={(e) => setTenantSel(e.target.value)} style={{ height: 34 }}>
              <option value="">Escolha o cliente…</option>
              {carteiras.map((c) => <option key={c.tenantId} value={c.tenantId}>{c.nome} — saldo {brl(c.saldo)}</option>)}
            </select>
          </label>
          <label style={campo}>Valor (R$)
            <input type="number" min={1} step="0.01" value={valorCortesia} onChange={(e) => setValorCortesia(Number(e.target.value) || 0)} style={{ width: 120, height: 34, textAlign: "right" }} />
          </label>
          <label style={{ ...campo, flex: "1 1 200px" }}>Motivo (opcional)
            <input value={motivoCortesia} onChange={(e) => setMotivoCortesia(e.target.value)} placeholder="Ex.: bônus de boas-vindas" style={{ height: 34 }} />
          </label>
          <button type="button" className="btn-erp primary sm" disabled={liberando} onClick={liberarCreditos}>{liberando ? "Liberando…" : "Liberar créditos"}</button>
        </div>
      </div>

      <div>
        <button type="button" className="btn-erp primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar configuração"}</button>
      </div>
    </div>
  );
}
