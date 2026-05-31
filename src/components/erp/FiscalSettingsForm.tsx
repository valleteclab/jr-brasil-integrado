"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import type { FiscalConfigSummary } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { LC116_LIST } from "@/domains/fiscal/lc116";

const PROVIDERS = [
  { value: "MANUAL", label: "Interno / Homologação (funcional sem certificado)" },
  { value: "FOCUS_NFE", label: "Focus NFe (NF-e/NFC-e/NFS-e)" },
  { value: "NFEIO", label: "NFe.io" },
  { value: "PLUGNOTAS", label: "PlugNotas" },
  { value: "WEBMANIA", label: "WebmaniaBR" },
  { value: "SPEDY", label: "Spedy (NF-e/NFC-e/NFS-e)" }
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
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [certBusy, setCertBusy] = useState(false);
  const [certMsg, setCertMsg] = useState("");
  const [certErr, setCertErr] = useState("");

  async function enviarCertificado() {
    setCertErr("");
    setCertMsg("");
    if (!certFile) { setCertErr("Selecione o arquivo .pfx do certificado A1."); return; }
    if (!certPassword.trim()) { setCertErr("Informe a senha do certificado."); return; }
    setCertBusy(true);
    try {
      const form = new FormData();
      form.append("file", certFile);
      form.append("password", certPassword);
      const res = await fetch("/api/erp/configuracoes/fiscal/certificado", { method: "POST", body: form });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar o certificado.");
      setCertMsg(data.message || "Certificado enviado com sucesso.");
      setCertFile(null);
      setCertPassword("");
    } catch (e) {
      setCertErr(e instanceof Error ? e.message : "Não foi possível enviar o certificado.");
    } finally {
      setCertBusy(false);
    }
  }

  const externalProvider = !["MANUAL", "INTERNO"].includes(config.provider);
  const isSpedy = config.provider === "SPEDY";
  const isFocusNfe = config.provider === "FOCUS_NFE";
  // Provedores que derivam a URL base do ambiente — baseUrl é opcional.
  const baseUrlOpcional = isSpedy || isFocusNfe;

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
          codigoServicoLc116Padrao: config.codigoServicoLc116Padrao,
          spedyModoEmissao: config.spedyModoEmissao,
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
    <>
      {message && <div className="alert success"><strong>Pronto</strong><span>{message}</span></div>}
      {error && <div className="alert danger"><strong>Atenção</strong><span>{error}</span></div>}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Provedor e ambiente</h3></div>
        <div className="erp-form">
          <label>
            Provedor de emissão
            <select value={config.provider} onChange={(e) => update("provider", e.target.value as FiscalConfigSummary["provider"])}>
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label>
            Ambiente
            <select value={config.environment} onChange={(e) => update("environment", e.target.value as FiscalConfigSummary["environment"])}>
              <option value="HOMOLOGACAO">Homologação</option>
              <option value="PRODUCAO">Produção</option>
            </select>
          </label>
          <label>
            Regime tributário
            <select value={config.regime} onChange={(e) => update("regime", e.target.value as FiscalConfigSummary["regime"])}>
              {REGIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={config.active} onChange={(e) => update("active", e.target.checked)} />
            Emissão ativa
          </label>
        </div>
      </div>

      {externalProvider && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Credenciais do provedor</h3></div>
          <p className="muted">As credenciais são criptografadas. Exibimos apenas os últimos dígitos.</p>
          {isSpedy && (
            <div className="alert info">
              <strong>Spedy</strong>
              <span>
                Informe a <strong>X-Api-Key</strong> da empresa no campo &ldquo;Token de integração&rdquo;.
                A URL base de produção/sandbox é definida automaticamente pelo ambiente selecionado —
                não é necessário preenchê-la. Cadastre o webhook na Spedy apontando para{" "}
                <code>/api/webhooks/spedy</code> para receber as mudanças de status das notas.
              </span>
            </div>
          )}
          {isFocusNfe && (
            <div className="alert info">
              <strong>Focus NFe</strong>
              <span>
                Informe o <strong>token</strong> da empresa (painel da Focus) no campo
                &ldquo;Token de integração&rdquo;. A URL base de produção
                (<code>api.focusnfe.com.br</code>) ou homologação
                (<code>homologacao.focusnfe.com.br</code>) é definida automaticamente pelo
                ambiente selecionado — deixe a URL base em branco. Os dados do emitente
                (endereço, IE e <strong>certificado A1</strong>) são cadastrados diretamente
                no painel da Focus, não aqui.
              </span>
            </div>
          )}
          <div className="erp-form">
            <label>
              URL base da API {baseUrlOpcional ? "(opcional)" : ""}
              <input
                value={config.baseUrl}
                onChange={(e) => update("baseUrl", e.target.value)}
                placeholder={baseUrlOpcional ? "Definida pelo ambiente — deixe em branco" : "https://api.exemplo.com.br"}
              />
            </label>
            <label>
              Token de integração {config.tokenLast4 ? `(atual ••••${config.tokenLast4})` : ""}
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={config.hasToken ? "Manter token atual" : "Informe o token"} />
            </label>
            <label>
              CSC ID (NFC-e)
              <input value={config.cscId} onChange={(e) => update("cscId", e.target.value)} />
            </label>
            <label>
              CSC Token (NFC-e)
              <input value={cscToken} onChange={(e) => setCscToken(e.target.value)} placeholder={config.hasCscToken ? "Manter token atual" : "Informe o CSC"} />
            </label>
          </div>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Documentos e numeração</h3></div>
        <div className="erp-form">
          <label className="check-row">
            <input type="checkbox" checked={config.emitNfe} onChange={(e) => update("emitNfe", e.target.checked)} />
            Emitir NF-e (modelo 55)
          </label>
          <label>
            Série NF-e
            <input value={config.serieNfe} onChange={(e) => update("serieNfe", e.target.value)} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={config.emitNfce} onChange={(e) => update("emitNfce", e.target.checked)} />
            Emitir NFC-e (modelo 65)
          </label>
          <label>
            Série NFC-e
            <input value={config.serieNfce} onChange={(e) => update("serieNfce", e.target.value)} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={config.emitNfse} onChange={(e) => update("emitNfse", e.target.checked)} />
            Emitir NFS-e (serviços)
          </label>
          <label>
            Série NFS-e
            <input value={config.serieNfse} onChange={(e) => update("serieNfse", e.target.value)} />
          </label>
          <label>
            Código IBGE do município
            <input value={config.codigoMunicipioIbge} onChange={(e) => update("codigoMunicipioIbge", e.target.value)} placeholder="Ex.: 2919207" />
          </label>
          <label className="full">
            Código de serviço padrão (LC 116) — usado na NFS-e quando o serviço da OS não tem código próprio
            <select value={config.codigoServicoLc116Padrao} onChange={(e) => update("codigoServicoLc116Padrao", e.target.value)}>
              <option value="">Sem padrão</option>
              {LC116_LIST.map((item) => (
                <option key={item.code} value={item.code}>{item.code} — {item.description}</option>
              ))}
            </select>
          </label>
          <label>
            Certificado digital (referência)
            <input value={config.certificadoInfo} onChange={(e) => update("certificadoInfo", e.target.value)} placeholder="Apelido/validade do A1 (sem o arquivo)" />
          </label>
        </div>
      </div>

      {isSpedy && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Modo de emissão (Spedy)</h3></div>
          <div className="erp-card-body">
            <div className="erp-form">
              <label className="full">
                Origem da tributação
                <select value={config.spedyModoEmissao || "COMPLETO"} onChange={(e) => update("spedyModoEmissao", e.target.value)}>
                  <option value="COMPLETO">Completo — tributação calculada pelo ERP (ICMS/PIS/COFINS na NF-e; ISS/retenções na NFS-e)</option>
                  <option value="SIMPLIFICADO">Simplificado — tributação no backoffice da Spedy (envia apenas dados comerciais; usa /orders)</option>
                </select>
              </label>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "8px 0 0" }}>
              No modo <b>Simplificado</b>, CFOP, NCM e alíquotas são definidos no painel da Spedy — o sistema envia
              apenas cliente, itens e valores. Use <b>Completo</b> para controlar a tributação por produto/serviço aqui no sistema.
            </p>
          </div>
        </div>
      )}

      {isSpedy && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Certificado digital A1</h3></div>
          <div className="erp-card-body">
            <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
              Envie o arquivo <b>.pfx</b> do certificado A1 da empresa. Ele é transmitido com segurança ao provedor (Spedy)
              para assinar as notas e <b>não é armazenado</b> em nosso sistema. {config.certificadoInfo ? `Atual: ${config.certificadoInfo}.` : ""}
            </p>
            {certErr && <div className="alert danger" style={{ marginBottom: 10 }}><span>{certErr}</span></div>}
            {certMsg && <div className="alert success" style={{ marginBottom: 10 }}><span>{certMsg}</span></div>}
            <div className="erp-form" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label>Arquivo do certificado (.pfx)
                <input type="file" accept=".pfx,application/x-pkcs12" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} />
              </label>
              <label>Senha do certificado
                <input type="password" value={certPassword} onChange={(e) => setCertPassword(e.target.value)} autoComplete="off" />
              </label>
            </div>
            <div className="erp-toolbar" style={{ borderBottom: "none", paddingBottom: 0, marginTop: 8 }}>
              <div className="grow" />
              <button type="button" className="btn-erp primary sm" onClick={enviarCertificado} disabled={certBusy}>
                {certBusy ? "Enviando…" : "Enviar certificado"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Observações</h3></div>
        <div className="erp-form">
          <label className="full">
            Notas internas
            <textarea rows={3} value={config.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Notas internas sobre a configuração fiscal" />
          </label>
        </div>
      </div>

      <div className="erp-toolbar">
        <div className="toolbar-grow" />
        <Button type="button" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</Button>
      </div>
    </>
  );
}
