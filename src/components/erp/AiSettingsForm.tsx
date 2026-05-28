"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import type { AiConfigSummary } from "@/domains/ai/openrouter-service";

type AiSettingsFormProps = {
  initialConfig: AiConfigSummary;
};

export function AiSettingsForm({ initialConfig }: AiSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [model, setModel] = useState(initialConfig.model);
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState(initialConfig.notes ?? "");
  const [config, setConfig] = useState(initialConfig);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function saveConfig() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/erp/configuracoes/ia", {
        body: JSON.stringify({ apiKey, model, enabled, notes }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      });
      const data = await response.json() as AiConfigSummary & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar a configuração de IA.");
      }

      setConfig(data);
      setApiKey("");
      setMessage("Configuração salva com segurança.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a configuração de IA.");
    } finally {
      setSaving(false);
    }
  }

  async function testConfig() {
    setTesting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/erp/configuracoes/ia/testar", { method: "POST" });
      const data = await response.json() as { ok?: boolean; message?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível testar a IA.");
      }

      setMessage(data.message || "IA configurada.");
      setConfig((current) => ({ ...current, testedAt: new Date().toISOString(), lastError: null }));
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Não foi possível testar a IA.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="erp-card ai-settings-card">
      <div className="erp-card-head">
        <div>
          <h3>OpenRouter</h3>
          <span>Chave por empresa, usada somente no servidor.</span>
        </div>
        <Status enabled={enabled} configured={config.configured} />
      </div>

      <div className="erp-form ai-settings-form">
        <label className="check-row full">
          <input checked={enabled} type="checkbox" onChange={(event) => setEnabled(event.target.checked)} />
          Ativar IA para esta empresa
        </label>

        <label>
          Modelo padrão
          <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="openai/gpt-4o-mini" />
        </label>

        <label>
          Chave da API
          <input
            autoComplete="off"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={config.keyLast4 ? `Chave cadastrada: ****${config.keyLast4}` : "Cole a chave da OpenRouter"}
          />
        </label>

        <label>
          Último teste
          <input readOnly value={config.testedAt ? new Date(config.testedAt).toLocaleString("pt-BR") : "Não testado"} />
        </label>

        <label className="full">
          Observações internas
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>

      {message && <div className="alert info ai-settings-alert"><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger ai-settings-alert"><strong>Atenção</strong><span>{error}</span></div>}
      {config.lastError && !error && (
        <div className="alert danger ai-settings-alert"><strong>Último erro</strong><span>{config.lastError}</span></div>
      )}

      <footer className="inline-foot">
        <Button type="button" variant="light" onClick={testConfig} disabled={testing || saving || !config.configured}>
          {testing ? "Testando..." : "Testar conexão"}
        </Button>
        <Button type="button" onClick={saveConfig} disabled={saving || testing}>
          {saving ? "Salvando..." : "Salvar configuração"}
        </Button>
      </footer>
    </section>
  );
}

function Status({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  if (!configured) {
    return <span className="status-badge warn">Sem chave</span>;
  }

  return <span className={`status-badge ${enabled ? "success" : "mute"}`}>{enabled ? "Ativa" : "Inativa"}</span>;
}
