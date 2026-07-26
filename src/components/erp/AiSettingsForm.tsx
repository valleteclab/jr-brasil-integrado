"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import type { AiConfigSummary } from "@/domains/ai/openrouter-service";
import { KOKORO_VOICES, type KokoroVoiceId } from "@/domains/ai/tts-voices";

type AiSettingsFormProps = {
  initialConfig: AiConfigSummary;
};

export function AiSettingsForm({ initialConfig }: AiSettingsFormProps) {
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [model, setModel] = useState(initialConfig.model);
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState(initialConfig.notes ?? "");
  const [voice, setVoice] = useState<KokoroVoiceId>(initialConfig.voice);
  const [config, setConfig] = useState(initialConfig);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<KokoroVoiceId | null>(null);

  async function saveConfig() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/erp/configuracoes/ia", {
        body: JSON.stringify({ apiKey, model, enabled, notes, voice }),
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

  async function previewVoice(selectedVoice: KokoroVoiceId) {
    setPreviewingVoice(selectedVoice);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/erp/configuracoes/ia/voz/preview", {
        body: JSON.stringify({ voice: selectedVoice }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Não foi possível gerar a demonstração.");
      }

      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      audio.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
      await audio.play();
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Não foi possível gerar a demonstração.");
    } finally {
      setPreviewingVoice(null);
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
    <>
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

    <section className="erp-card ai-settings-card voice-settings-card">
      <div className="erp-card-head">
        <div>
          <h3>Voz do assistente</h3>
          <span>Usada nas respostas de áudio do Telegram e WhatsApp.</span>
        </div>
        <span className="status-badge info">{KOKORO_VOICES.find((item) => item.id === voice)?.name}</span>
      </div>

      <div className="voice-options">
        {KOKORO_VOICES.map((item) => (
          <label className={`voice-option ${voice === item.id ? "selected" : ""}`} key={item.id}>
            <input
              checked={voice === item.id}
              name="kokoro-voice"
              type="radio"
              value={item.id}
              onChange={() => setVoice(item.id)}
            />
            <span className="voice-option-copy">
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </span>
            <Button
              disabled={previewingVoice !== null}
              type="button"
              variant="light"
              onClick={(event) => {
                event.preventDefault();
                void previewVoice(item.id);
              }}
            >
              {previewingVoice === item.id ? "Gerando..." : "Ouvir"}
            </Button>
          </label>
        ))}
      </div>

      <footer className="inline-foot">
        <span className="voice-save-hint">A voz escolhida entra em uso após salvar.</span>
        <Button type="button" onClick={saveConfig} disabled={saving || testing || previewingVoice !== null}>
          {saving ? "Salvando..." : "Salvar voz"}
        </Button>
      </footer>
    </section>
    </>
  );
}

function Status({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  if (!configured) {
    return <span className="status-badge warn">Sem chave</span>;
  }

  return <span className={`status-badge ${enabled ? "success" : "mute"}`}>{enabled ? "Ativa" : "Inativa"}</span>;
}
