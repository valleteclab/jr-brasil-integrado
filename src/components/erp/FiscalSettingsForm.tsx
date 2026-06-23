"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import type { FiscalConfigSummary } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { LC116_LIST } from "@/domains/fiscal/lc116";
import { ajustarLogoFiscal } from "@/lib/images/logo-fiscal";

const PROVIDERS = [
  { value: "MANUAL", label: "Interno / Homologação (funcional sem certificado)" },
  { value: "FOCUS_NFE", label: "Focus NFe (NF-e/NFC-e/NFS-e)" },
  { value: "NFEIO", label: "NFe.io" },
  { value: "PLUGNOTAS", label: "PlugNotas" },
  { value: "WEBMANIA", label: "WebmaniaBR" },
  { value: "SPEDY", label: "Spedy (NF-e/NFC-e/NFS-e)" },
  { value: "ACBR", label: "ACBr API (NF-e/NFC-e/NFS-e)" }
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
  const [nfceCsc, setNfceCsc] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [certBusy, setCertBusy] = useState(false);
  const [certMsg, setCertMsg] = useState("");
  const [certErr, setCertErr] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoAjustando, setLogoAjustando] = useState(false);
  const [logoInfo, setLogoInfo] = useState("");
  const [logoMsg, setLogoMsg] = useState("");
  const [logoErr, setLogoErr] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function testarConexao() {
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/erp/fiscal/configuracao/testar", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      setTestResult({ ok: Boolean(data.ok), message: data.message || data.error || "Sem resposta do provedor." });
    } catch {
      setTestResult({ ok: false, message: "Não foi possível contatar o provedor." });
    } finally {
      setTestBusy(false);
    }
  }

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

  // Preview local da imagem selecionada (objeto URL revogado quando troca/limpa).
  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  async function selecionarLogo(file: File | null) {
    setLogoErr("");
    setLogoMsg("");
    setLogoInfo("");
    if (!file) {
      setLogoFile(null);
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLogoErr("Formato inválido. Envie PNG, JPEG ou WebP.");
      return;
    }
    // Ajuste automático: redimensiona, achata em fundo branco e comprime para o DANFE.
    setLogoAjustando(true);
    try {
      const r = await ajustarLogoFiscal(file);
      setLogoFile(r.file);
      setLogoInfo(`Imagem ajustada automaticamente: ${r.largura}×${r.altura}px · ${(r.bytes / 1024).toFixed(0)} KB · ${r.tipo === "image/png" ? "PNG" : "JPEG"}`);
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : "Não foi possível ajustar a imagem.");
    } finally {
      setLogoAjustando(false);
    }
  }

  async function enviarLogotipo() {
    setLogoErr("");
    setLogoMsg("");
    if (!logoFile) { setLogoErr("Selecione a imagem da logo (PNG ou JPEG)."); return; }
    setLogoBusy(true);
    try {
      const form = new FormData();
      form.append("file", logoFile);
      const res = await fetch("/api/erp/configuracoes/fiscal/logotipo", { method: "POST", body: form });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível enviar a logo.");
      setLogoMsg(data.message || "Logo enviada com sucesso.");
      setConfig((c) => ({ ...c, logotipoInfo: logoFile.name }));
      setLogoFile(null);
      setLogoInfo("");
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : "Não foi possível enviar a logo.");
    } finally {
      setLogoBusy(false);
    }
  }

  async function removerLogotipo() {
    if (!window.confirm("Remover a logo da empresa? As próximas notas sairão sem logo.")) return;
    setLogoErr("");
    setLogoMsg("");
    setLogoBusy(true);
    try {
      const res = await fetch("/api/erp/configuracoes/fiscal/logotipo", { method: "DELETE" });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível remover a logo.");
      setLogoMsg(data.message || "Logo removida.");
      setLogoFile(null);
      setConfig((c) => ({ ...c, logotipoInfo: "" }));
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : "Não foi possível remover a logo.");
    } finally {
      setLogoBusy(false);
    }
  }

  const externalProvider = !["MANUAL", "INTERNO"].includes(config.provider);
  const isSpedy = config.provider === "SPEDY";
  const isFocusNfe = config.provider === "FOCUS_NFE";
  const isAcbr = config.provider === "ACBR";
  // Provedores que derivam a URL base do ambiente — baseUrl é opcional.
  const baseUrlOpcional = isSpedy || isFocusNfe || isAcbr;
  // Provedores que aceitam envio de certificado pela plataforma.
  const aceitaCertificado = isSpedy || isAcbr;

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
          // NÃO enviamos `provider`: ele é global (definido em /admin/provedor-fiscal). Sem provider,
          // o backend herda o provedor ativo da plataforma e não exige credencial por empresa —
          // assim a "Emissão ativa" não fica travada por um Client ID que é da plataforma.
          environment: config.environment,
          regime: config.regime,
          baseUrl: config.baseUrl,
          token: token || undefined,
          cscId: config.cscId,
          cscToken: cscToken || undefined,
          nfceIdCsc: config.nfceIdCsc,
          nfceCsc: nfceCsc || undefined,
          serieNfe: config.serieNfe,
          serieNfce: config.serieNfce,
          serieNfse: config.serieNfse,
          emitNfe: config.emitNfe,
          emitNfce: config.emitNfce,
          emitNfse: config.emitNfse,
          codigoMunicipioIbge: config.codigoMunicipioIbge,
          codigoServicoLc116Padrao: config.codigoServicoLc116Padrao,
          codigoNbsPadrao: config.codigoNbsPadrao,
          spedyModoEmissao: config.spedyModoEmissao,
          nfseAmbienteNacional: config.nfseAmbienteNacional,
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
      setNfceCsc("");
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
            {/* O provedor (e suas credenciais) é definido pela PLATAFORMA, em /admin/provedor-fiscal.
                A empresa não escolhe nem configura credenciais aqui — só vê qual está ativo. */}
            <input
              value={PROVIDERS.find((p) => p.value === config.provider)?.label ?? config.provider}
              readOnly
              disabled
              title="O provedor de emissão é definido pelo administrador da plataforma."
            />
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
          {isAcbr && (
            <div className="alert info">
              <strong>ACBr API</strong>
              <span>
                As credenciais da ACBr (Client ID/Secret e URL base) são configuradas pelo{" "}
                <strong>administrador da plataforma</strong> e valem para todas as empresas — você
                não precisa informá-las aqui. Nesta tela ficam só os dados da sua empresa:{" "}
                <strong>CSC da NFC-e</strong>, <strong>certificado A1</strong> e logo. Use{" "}
                &ldquo;Testar conexão&rdquo; para validar.
              </span>
            </div>
          )}
          <div className="erp-form">
            {/* ACBr: URL base, Client ID e Client Secret são da PLATAFORMA — não aparecem aqui.
                Demais provedores (legado) ainda informam credencial própria. */}
            {!isAcbr && (
              <label>
                URL base da API {baseUrlOpcional ? "(opcional)" : ""}
                <input
                  value={config.baseUrl}
                  onChange={(e) => update("baseUrl", e.target.value)}
                  placeholder={baseUrlOpcional ? "Definida pelo ambiente — deixe em branco" : "https://api.exemplo.com.br"}
                />
              </label>
            )}
            {!isAcbr && (
              <label>
                Token de integração {config.tokenLast4 ? `(atual ••••${config.tokenLast4})` : ""}
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={config.hasToken ? "Manter token atual" : "Informe o token"}
                />
              </label>
            )}
            {isAcbr && (
              <>
                <label>
                  ID CSC (NFC-e)
                  <input value={config.nfceIdCsc} onChange={(e) => update("nfceIdCsc", e.target.value)} placeholder="Ex.: 1" inputMode="numeric" />
                </label>
                <label>
                  Código CSC (NFC-e){config.hasNfceCsc ? " (já salvo)" : ""}
                  <input value={nfceCsc} onChange={(e) => setNfceCsc(e.target.value)} placeholder={config.hasNfceCsc ? "Manter CSC atual" : "Código de Segurança do Contribuinte"} />
                </label>
              </>
            )}
            {!isAcbr && (
              <>
                <label>
                  CSC ID (NFC-e)
                  <input value={config.cscId} onChange={(e) => update("cscId", e.target.value)} />
                </label>
                <label>
                  CSC Token (NFC-e)
                  <input value={cscToken} onChange={(e) => setCscToken(e.target.value)} placeholder={config.hasCscToken ? "Manter token atual" : "Informe o CSC"} />
                </label>
              </>
            )}
          </div>
          <div className="erp-toolbar" style={{ borderBottom: "none", paddingBottom: 0, marginTop: 8, gap: 12, alignItems: "center" }}>
            <Button type="button" variant="light" onClick={testarConexao} disabled={testBusy}>
              {testBusy ? "Testando…" : "Testar conexão"}
            </Button>
            <span className="muted">Testa a credencial já salva. Salve antes de testar uma credencial nova.</span>
          </div>
          {testResult && (
            <div className={`alert ${testResult.ok ? "success" : "danger"}`}>
              <strong>{testResult.ok ? "Conexão OK" : "Falha na conexão"}</strong>
              <span>{testResult.message}</span>
            </div>
          )}
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
          <label className="full">
            Código NBS padrão (NFS-e) — Nomenclatura Brasileira de Serviços, 9 dígitos
            <input
              value={config.codigoNbsPadrao}
              onChange={(e) => update("codigoNbsPadrao", e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="Ex.: 115029100"
              inputMode="numeric"
            />
          </label>
          <label>
            Ambiente da NFS-e (município)
            <select
              value={config.nfseAmbienteNacional === null ? "auto" : config.nfseAmbienteNacional ? "nacional" : "padrao"}
              onChange={(e) => update("nfseAmbienteNacional", e.target.value === "auto" ? null : e.target.value === "nacional")}
            >
              <option value="auto">Detectar automaticamente</option>
              <option value="nacional">Ambiente Nacional — alíquota definida pelo sistema (não informar)</option>
              <option value="padrao">Padrão do município — informar alíquota</option>
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

      {aceitaCertificado && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Certificado digital A1</h3></div>
          <div className="erp-card-body">
            <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
              Envie o arquivo <b>.pfx</b> do certificado A1 da empresa. Ele é transmitido com segurança ao provedor ({isAcbr ? "ACBr" : "Spedy"})
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

      {isAcbr && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Logo da empresa (DANFE/cupom)</h3></div>
          <div className="erp-card-body">
            <p style={{ fontSize: 12.5, color: "var(--erp-mute)", margin: "0 0 12px" }}>
              Envie a logo da sua empresa em <b>PNG ou JPEG</b> (até <b>200 KB</b>). Ela é enviada ao
              cadastro da empresa na ACBr e aparece no topo do <b>DANFE/DANFCE/DANFSE</b> impresso.
              {config.logotipoInfo ? ` Atual: ${config.logotipoInfo}.` : ""}
            </p>
            {logoErr && <div className="alert danger" style={{ marginBottom: 10 }}><span>{logoErr}</span></div>}
            {logoMsg && <div className="alert success" style={{ marginBottom: 10 }}><span>{logoMsg}</span></div>}
            {logoInfo && <div className="alert info" style={{ marginBottom: 10 }}><span>{logoInfo}</span></div>}
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div className="erp-form" style={{ gridTemplateColumns: "1fr", flex: 1, minWidth: 220 }}>
                <label>Arquivo da logo (PNG, JPEG ou WebP)
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => selecionarLogo(e.target.files?.[0] ?? null)} disabled={logoAjustando} />
                  <small className="block-muted">A imagem é ajustada automaticamente para o documento fiscal (redimensionada, fundo branco e comprimida abaixo de 200 KB).</small>
                </label>
              </div>
              {logoPreview && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--erp-mute)", marginBottom: 4 }}>{logoAjustando ? "Ajustando…" : "Pré-visualização (já ajustada)"}</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoPreview} alt="Pré-visualização da logo" style={{ maxWidth: 160, maxHeight: 90, objectFit: "contain", border: "1px solid var(--erp-line)", borderRadius: 6, background: "#fff", padding: 4 }} />
                </div>
              )}
            </div>
            <div className="erp-toolbar" style={{ borderBottom: "none", paddingBottom: 0, marginTop: 8, gap: 8 }}>
              {config.logotipoInfo && (
                <button type="button" className="btn-erp danger sm" onClick={removerLogotipo} disabled={logoBusy}>
                  Remover logo atual
                </button>
              )}
              <div className="grow" />
              <button type="button" className="btn-erp primary sm" onClick={enviarLogotipo} disabled={logoBusy || logoAjustando || !logoFile}>
                {logoBusy ? "Enviando…" : logoAjustando ? "Ajustando…" : "Enviar logo"}
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
