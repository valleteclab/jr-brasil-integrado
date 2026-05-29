"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import type { FiscalConfigSummary } from "@/domains/fiscal/application/fiscal-config-use-cases";

const PROVIDERS = [
  { value: "MANUAL", label: "Interno / Homologação (funcional sem certificado)" },
  { value: "FOCUS_NFE", label: "Focus NFe" },
  { value: "NFEIO", label: "NFe.io" },
  { value: "PLUGNOTAS", label: "PlugNotas" },
  { value: "WEBMANIA", label: "WebmaniaBR" }
];

const REGIMES = [
  { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
  { value: "SIMPLES_EXCESSO_SUBLIMITE", label: "Simples Nacional - excesso de sublimite" },
  { value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { value: "LUCRO_REAL", label: "Lucro Real" },
  { value: "MEI", label: "MEI" }
];

export function FiscalSettingsForm({ initialConfig }: { initialConfig: FiscalConfigSummary }) {
  const [config, setConfig] = useState(initialConfig);
  const [token, setToken] = useState("");
  const [cscToken, setCscToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const externalProvider = !["MANUAL", "INTERNO"].includes(config.provider);

  function update<K extends keyof FiscalConfigSummary>(key: K, value: FiscalConfigSummary[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/erp/fiscal/configuracao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          environment: config.environment,
          regime: config.regime,
          baseUrl: config.baseUrl,
          token: token || undefined,
          cscId: config.cscId,
          cscToken: cscToken || undefined,
          serieNfe: config.serieNfe,
          serieNfce: config.serieNfce,
          serieNfse: config.serieNfse,
          emitNfe: config.emitNfe,
          emitNfce: config.emitNfce,
          emitNfse: config.emitNfse,
          codigoMunicipioIbge: config.codigoMunicipioIbge,
          certificadoInfo: config.certificadoInfo,
          active: config.active,
          notes: config.notes
        })
      });
      const data = (await response.json()) as FiscalConfigSummary & { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a configuração.");
      setConfig(data);
      setToken("");
      setCscToken("");
      setMessage("Configuração fiscal salva com sucesso.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a configuração.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="op-form-stack">
      {message && <div className="alert success"><strong>Pronto</strong><span>{message}</span></div>}
      {error && <div className="alert danger"><strong>Atenção</strong><span>{error}</span></div>}

      <Card className="op-form-card">
        <h2>Provedor e ambiente</h2>
        <div className="op-form-grid">
          <label>
            <span>Provedor de emissão</span>
            <select value={config.provider} onChange={(e) => update("provider", e.target.value as FiscalConfigSummary["provider"])}>
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label>
            <span>Ambiente</span>
            <select value={config.environment} onChange={(e) => update("environment", e.target.value as FiscalConfigSummary["environment"])}>
              <option value="HOMOLOGACAO">Homologação</option>
              <option value="PRODUCAO">Produção</option>
            </select>
          </label>
          <label>
            <span>Regime tributário</span>
            <select value={config.regime} onChange={(e) => update("regime", e.target.value as FiscalConfigSummary["regime"])}>
              {REGIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="op-check">
            <input type="checkbox" checked={config.active} onChange={(e) => update("active", e.target.checked)} />
            <span>Emissão ativa</span>
          </label>
        </div>
      </Card>

      {externalProvider && (
        <Card className="op-form-card">
          <h2>Credenciais do provedor</h2>
          <p className="op-hint">As credenciais são criptografadas. Exibimos apenas os últimos dígitos.</p>
          <div className="op-form-grid">
            <label>
              <span>URL base da API</span>
              <input value={config.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://api.focusnfe.com.br" />
            </label>
            <label>
              <span>Token de integração {config.tokenLast4 ? `(atual ••••${config.tokenLast4})` : ""}</span>
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={config.hasToken ? "Manter token atual" : "Informe o token"} />
            </label>
            <label>
              <span>CSC ID (NFC-e)</span>
              <input value={config.cscId} onChange={(e) => update("cscId", e.target.value)} />
            </label>
            <label>
              <span>CSC Token (NFC-e)</span>
              <input value={cscToken} onChange={(e) => setCscToken(e.target.value)} placeholder={config.hasCscToken ? "Manter token atual" : "Informe o CSC"} />
            </label>
          </div>
        </Card>
      )}

      <Card className="op-form-card">
        <h2>Documentos e numeração</h2>
        <div className="op-form-grid">
          <label className="op-check">
            <input type="checkbox" checked={config.emitNfe} onChange={(e) => update("emitNfe", e.target.checked)} />
            <span>Emitir NF-e (modelo 55)</span>
          </label>
          <label>
            <span>Série NF-e</span>
            <input value={config.serieNfe} onChange={(e) => update("serieNfe", e.target.value)} />
          </label>
          <label className="op-check">
            <input type="checkbox" checked={config.emitNfce} onChange={(e) => update("emitNfce", e.target.checked)} />
            <span>Emitir NFC-e (modelo 65)</span>
          </label>
          <label>
            <span>Série NFC-e</span>
            <input value={config.serieNfce} onChange={(e) => update("serieNfce", e.target.value)} />
          </label>
          <label className="op-check">
            <input type="checkbox" checked={config.emitNfse} onChange={(e) => update("emitNfse", e.target.checked)} />
            <span>Emitir NFS-e (serviços)</span>
          </label>
          <label>
            <span>Série NFS-e</span>
            <input value={config.serieNfse} onChange={(e) => update("serieNfse", e.target.value)} />
          </label>
          <label>
            <span>Código IBGE do município</span>
            <input value={config.codigoMunicipioIbge} onChange={(e) => update("codigoMunicipioIbge", e.target.value)} placeholder="Ex.: 2919207" />
          </label>
          <label>
            <span>Certificado digital (referência)</span>
            <input value={config.certificadoInfo} onChange={(e) => update("certificadoInfo", e.target.value)} placeholder="Apelido/validade do A1 (sem o arquivo)" />
          </label>
        </div>
      </Card>

      <Card className="op-form-card">
        <h2>Observações</h2>
        <textarea rows={3} value={config.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Notas internas sobre a configuração fiscal" />
      </Card>

      <div className="op-form-actions">
        <Button type="button" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</Button>
      </div>
    </div>
  );
}
