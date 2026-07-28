"use client";

import { useEffect, useState } from "react";
import styles from "./CommercialAgentSettings.module.css";

type Settings = {
  ativo: boolean;
  nomeAgente: string;
  numeroWhatsapp: string;
  whatsappInstanceId: string;
  temWhatsappToken: boolean;
  temWhatsappClientToken: boolean;
  temOpenrouterKey: boolean;
  openrouterKeyFinal: string | null;
  modeloIa: string;
  telefoneHumano: string;
  urlCadastro: string;
  precoMensal: number;
  promptComplementar: string;
  webhookUrl: string | null;
};

const EMPTY: Settings = {
  ativo: false,
  nomeAgente: "Especialista XERP",
  numeroWhatsapp: "",
  whatsappInstanceId: "",
  temWhatsappToken: false,
  temWhatsappClientToken: false,
  temOpenrouterKey: false,
  openrouterKeyFinal: null,
  modeloIa: "openai/gpt-4o-mini",
  telefoneHumano: "",
  urlCadastro: "/cadastro?plano=chat",
  precoMensal: 97,
  promptComplementar: "",
  webhookUrl: null
};

export function CommercialAgentSettings() {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [whatsappToken, setWhatsappToken] = useState("");
  const [whatsappClientToken, setWhatsappClientToken] = useState("");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/agente-comercial", { cache: "no-store" });
        const data = (await response.json()) as Settings & { error?: string };
        if (!response.ok) throw new Error(data.error || "Falha ao carregar a configuração.");
        setSettings(data);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Falha ao carregar a configuração.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(regenerarWebhook = false) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/agente-comercial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          whatsappToken,
          whatsappClientToken,
          openrouterApiKey,
          regenerarWebhook
        })
      });
      const data = (await response.json()) as Settings & { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao salvar a configuração.");
      setSettings(data);
      setWhatsappToken("");
      setWhatsappClientToken("");
      setOpenrouterApiKey("");
      setSuccess(regenerarWebhook ? "Configuração salva e webhook regenerado." : "Agente comercial configurado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar a configuração.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="erp-card"><span className="block-muted">Carregando configuração…</span></div>;

  return (
    <div className={styles.layout}>
      <div className="erp-card erp-form" style={{ padding: 18 }}>
        {error && <div className="alert danger" style={{ marginBottom: 12 }}><span>{error}</span></div>}
        {success && <div className="alert success" style={{ marginBottom: 12 }}><span>{success}</span></div>}

        <label style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 16 }}>
          <input type="checkbox" checked={settings.ativo} onChange={(e) => setSettings({ ...settings, ativo: e.target.checked })} />
          <strong>Agente comercial ativo</strong>
        </label>

        <div className="form-grid two">
          <label>Nome apresentado ao lead
            <input value={settings.nomeAgente} onChange={(e) => setSettings({ ...settings, nomeAgente: e.target.value })} />
          </label>
          <label>Número comercial
            <input inputMode="numeric" placeholder="5577999999999" value={settings.numeroWhatsapp} onChange={(e) => setSettings({ ...settings, numeroWhatsapp: e.target.value.replace(/\D/g, "") })} />
          </label>
          <label>Instância Z-API
            <input value={settings.whatsappInstanceId} onChange={(e) => setSettings({ ...settings, whatsappInstanceId: e.target.value })} />
          </label>
          <label>Telefone para atendimento humano
            <input inputMode="numeric" value={settings.telefoneHumano} onChange={(e) => setSettings({ ...settings, telefoneHumano: e.target.value.replace(/\D/g, "") })} />
          </label>
          <label>Token Z-API {settings.temWhatsappToken && <small>· configurado</small>}
            <input type="password" value={whatsappToken} onChange={(e) => setWhatsappToken(e.target.value)} placeholder={settings.temWhatsappToken ? "Deixe vazio para manter" : "Informe o token"} />
          </label>
          <label>Client-Token Z-API {settings.temWhatsappClientToken && <small>· configurado</small>}
            <input type="password" value={whatsappClientToken} onChange={(e) => setWhatsappClientToken(e.target.value)} placeholder={settings.temWhatsappClientToken ? "Deixe vazio para manter" : "Opcional"} />
          </label>
          <label>Modelo da IA
            <input value={settings.modeloIa} onChange={(e) => setSettings({ ...settings, modeloIa: e.target.value })} />
          </label>
          <label>Chave OpenRouter {settings.temOpenrouterKey && <small>· final {settings.openrouterKeyFinal}</small>}
            <input type="password" value={openrouterApiKey} onChange={(e) => setOpenrouterApiKey(e.target.value)} placeholder={settings.temOpenrouterKey ? "Deixe vazio para manter" : "sk-or-..."} />
          </label>
          <label>Mensalidade apresentada
            <input type="number" min={0} step="0.01" value={settings.precoMensal} onChange={(e) => setSettings({ ...settings, precoMensal: Number(e.target.value) })} />
          </label>
          <label>Link de cadastro/teste
            <input value={settings.urlCadastro} onChange={(e) => setSettings({ ...settings, urlCadastro: e.target.value })} />
          </label>
        </div>

        <label>Orientações adicionais ao agente
          <textarea
            rows={6}
            value={settings.promptComplementar}
            onChange={(e) => setSettings({ ...settings, promptComplementar: e.target.value })}
            placeholder="Campanha vigente, público prioritário, condições comerciais autorizadas…"
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button type="button" className="btn-erp light" onClick={() => void save(true)} disabled={saving}>
            Regenerar webhook
          </button>
          <button type="button" className="btn-erp primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando…" : "Salvar configuração"}
          </button>
        </div>
      </div>

      <aside className="erp-card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Prontidão do canal</h3>
        <ul style={{ paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>
          <li>{settings.numeroWhatsapp ? "✓" : "○"} Número comercial separado</li>
          <li>{settings.whatsappInstanceId && settings.temWhatsappToken ? "✓" : "○"} WhatsApp conectado</li>
          <li>{settings.temOpenrouterKey ? "✓" : "○"} Inteligência configurada</li>
          <li>{settings.webhookUrl ? "✓" : "○"} Webhook gerado</li>
          <li>{settings.telefoneHumano ? "✓" : "○"} Escalonamento humano</li>
        </ul>
        <div style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 12 }}>Webhook “Ao receber”</strong>
          <div className="mono" style={{ marginTop: 6, padding: 10, borderRadius: 8, background: "#f8fafc", border: "1px solid var(--erp-line)", wordBreak: "break-all", fontSize: 11 }}>
            {settings.webhookUrl || "Salve a configuração para gerar a URL."}
          </div>
        </div>
        <p className="block-muted" style={{ marginTop: 12 }}>
          Este canal cria leads da plataforma. Ele não acessa empresas, notas, produtos ou dados dos clientes do ERP.
        </p>
      </aside>
    </div>
  );
}
