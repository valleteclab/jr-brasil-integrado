"use client";

import { FormEvent, useState } from "react";
import s from "./launch.module.css";

type FormState = {
  nome: string;
  telefone: string;
  segmento: string;
};

const INITIAL: FormState = {
  nome: "",
  telefone: "",
  segmento: ""
};

function campaignParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source") || "landing",
    utmMedium: params.get("utm_medium") || "organic",
    utmCampaign: params.get("utm_campaign") || "nota-por-audio",
    utmContent: params.get("utm_content") || undefined,
    utmTerm: params.get("utm_term") || undefined
  };
}

export function LaunchLeadForm({ compact = false }: { compact?: boolean }) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [consentimento, setConsentimento] = useState(true);
  const [site, setSite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          telefone: form.telefone.replace(/\D/g, ""),
          site,
          consentimento,
          canalOrigem: "LANDING_PAGE",
          origem: "Landing Nota por Áudio",
          campanha: "nota-por-audio",
          dorPrincipal: "Quer testar a operação do XERP por áudio.",
          ...campaignParams()
        })
      });
      const data = (await response.json()) as { leadId?: string; error?: string };
      if (!response.ok || !data.leadId) {
        throw new Error(data.error || "Não foi possível liberar o teste agora.");
      }
      window.location.assign(`/cadastro?plano=chat&lead=${encodeURIComponent(data.leadId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível liberar o teste agora.");
      setLoading(false);
    }
  }

  return (
    <form className={`${s.leadForm} ${compact ? s.leadFormCompact : ""}`} onSubmit={submit}>
      <div className={s.formHeading}>
        <span className={s.formPulse} />
        <span>Libere seu teste em menos de 1 minuto</span>
      </div>
      <div className={s.formFields}>
        <label>
          <span>Seu nome</span>
          <input
            required
            autoComplete="name"
            value={form.nome}
            onChange={(event) => setForm({ ...form, nome: event.target.value })}
            placeholder="Como podemos te chamar?"
          />
        </label>
        <label>
          <span>WhatsApp</span>
          <input
            required
            minLength={10}
            inputMode="tel"
            autoComplete="tel"
            value={form.telefone}
            onChange={(event) => setForm({ ...form, telefone: event.target.value })}
            placeholder="(77) 99999-9999"
          />
        </label>
        <label>
          <span>Seu negócio</span>
          <select
            required
            value={form.segmento}
            onChange={(event) => setForm({ ...form, segmento: event.target.value })}
          >
            <option value="">Selecione</option>
            <option>Prestação de serviços</option>
            <option>Comércio e varejo</option>
            <option>Oficina e autopeças</option>
            <option>Contabilidade</option>
            <option>Outro segmento</option>
          </select>
        </label>
      </div>
      <label className={s.honeypot} aria-hidden="true">
        Site
        <input tabIndex={-1} autoComplete="off" value={site} onChange={(event) => setSite(event.target.value)} />
      </label>
      <label className={s.consent}>
        <input
          type="checkbox"
          required
          checked={consentimento}
          onChange={(event) => setConsentimento(event.target.checked)}
        />
        <span>Aceito receber o acesso e orientações sobre o XERP. Posso sair quando quiser.</span>
      </label>
      {error && <div className={s.formError} role="alert">{error}</div>}
      <button className={s.formButton} type="submit" disabled={loading}>
        {loading ? "Preparando seu acesso…" : "Quero emitir minha primeira nota por áudio"}
        {!loading && <span aria-hidden="true">→</span>}
      </button>
      <small>Sem cartão de crédito. Seus dados não são vendidos nem compartilhados.</small>
    </form>
  );
}
