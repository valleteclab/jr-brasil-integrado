"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import type { FiscalOnboardingData } from "@/domains/fiscal/application/fiscal-onboarding-use-cases";

const PROVIDERS = [
  { value: "INTERNO", label: "Interno (homologação funcional, sem certificado)" },
  { value: "FOCUS_NFE", label: "Focus NFe" },
  { value: "NFEIO", label: "NFe.io" },
  { value: "PLUGNOTAS", label: "PlugNotas" },
  { value: "WEBMANIA", label: "WebmaniaBR" },
  { value: "MANUAL", label: "Manual (registro sem transmissão)" }
];

const REGIMES = [
  { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
  { value: "SIMPLES_EXCESSO_SUBLIMITE", label: "Simples Nacional · excesso de sublimite" },
  { value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { value: "LUCRO_REAL", label: "Lucro Real" },
  { value: "MEI", label: "MEI" }
];

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const STEPS = ["Empresa", "Endereço fiscal", "Emissão", "Revisão"];

type FormState = FiscalOnboardingData["empresa"] &
  Omit<FiscalOnboardingData["config"], "hasToken" | "hasCscToken"> & {
    gerarBaseNacional: boolean;
  };

function regimeLabel(value: string) {
  return REGIMES.find((r) => r.value === value)?.label ?? value;
}

export function FiscalOnboardingWizard({ initialData }: { initialData: FiscalOnboardingData }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [token, setToken] = useState("");
  const [cscToken, setCscToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ baselineRules: number } | null>(null);

  const [form, setForm] = useState<FormState>({
    ...initialData.empresa,
    ...initialData.config,
    gerarBaseNacional: true
  });

  const externalProvider = !["INTERNO", "MANUAL"].includes(form.provider);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const stepError = useMemo(() => {
    if (step === 0) {
      if (!form.razaoSocial.trim()) return "Informe a razão social.";
      if (!form.cnpj.trim()) return "Informe o CNPJ.";
    }
    if (step === 1) {
      if (!form.enderecoUf.trim()) return "Selecione a UF.";
    }
    if (step === 2 && externalProvider) {
      if (!form.baseUrl.trim()) return "Provedor externo exige a URL base.";
      if (!initialData.config.hasToken && !token.trim()) return "Provedor externo exige o token de integração.";
    }
    return "";
  }, [step, form, externalProvider, token, initialData.config.hasToken]);

  function next() {
    if (stepError) {
      setError(stepError);
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function finish() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/erp/configuracoes/fiscal/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razaoSocial: form.razaoSocial,
          nomeFantasia: form.nomeFantasia,
          cnpj: form.cnpj,
          inscricaoEstadual: form.inscricaoEstadual,
          inscricaoMunicipal: form.inscricaoMunicipal,
          regime: form.regime,
          enderecoLogradouro: form.enderecoLogradouro,
          enderecoNumero: form.enderecoNumero,
          enderecoComplemento: form.enderecoComplemento,
          enderecoBairro: form.enderecoBairro,
          enderecoCidade: form.enderecoCidade,
          enderecoUf: form.enderecoUf,
          enderecoCep: form.enderecoCep,
          codigoMunicipioIbge: form.codigoMunicipioIbge,
          telefone: form.telefone,
          email: form.email,
          provider: form.provider,
          environment: form.environment,
          baseUrl: form.baseUrl,
          token: token || undefined,
          cscId: form.cscId,
          cscToken: cscToken || undefined,
          serieNfe: form.serieNfe,
          serieNfce: form.serieNfce,
          serieNfse: form.serieNfse,
          emitNfe: form.emitNfe,
          emitNfce: form.emitNfce,
          emitNfse: form.emitNfse,
          certificadoInfo: form.certificadoInfo,
          active: form.active,
          notes: form.notes,
          gerarBaseNacional: form.gerarBaseNacional
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Erro ao concluir o onboarding fiscal.");
      }
      setDone({ baselineRules: payload.baselineRules ?? 0 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao concluir o onboarding fiscal.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Card>
        <div className="alert success" style={{ marginBottom: 16 }}>
          <strong>Configuração fiscal concluída.</strong>
          <span>
            {done.baselineRules > 0
              ? `Geramos ${done.baselineRules} regras-base nacionais para o regime ${regimeLabel(form.regime)} (${form.enderecoUf}). A empresa já pode emitir documentos fiscais.`
              : "Configuração salva. A base tributária nacional não foi gerada — cadastre regras manualmente em Regras tributárias."}
          </span>
        </div>
        <p style={{ marginBottom: 16, color: "var(--erp-muted, #64748b)" }}>
          A base nacional cobre ICMS, PIS e COFINS de venda conforme o regime. Casos específicos (benefício
          fiscal, substituição tributária, IPI por NCM) devem ser revisados em Regras tributárias — elas
          sempre prevalecem sobre a base por especificidade.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button href="/erp/fiscal">Ir para NF-e emitidas</Button>
          <Button href="/erp/regras-tributarias" variant="light">Revisar regras tributárias</Button>
          <Button href="/erp/configuracoes/fiscal" variant="light">Ajustar configuração</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <ol className="wizard-steps">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "active" : index < step ? "done" : ""}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="alert danger" style={{ marginBottom: 16 }}>
          <span>{error}</span>
        </div>
      )}

      {step === 0 && (
        <div className="form-grid two">
          <label className="full">
            Razão social*
            <input value={form.razaoSocial} onChange={(e) => update("razaoSocial", e.target.value)} />
          </label>
          <label className="full">
            Nome fantasia
            <input value={form.nomeFantasia} onChange={(e) => update("nomeFantasia", e.target.value)} />
          </label>
          <label>
            CNPJ*
            <input value={form.cnpj} onChange={(e) => update("cnpj", e.target.value)} placeholder="00.000.000/0001-00" />
          </label>
          <label>
            Regime tributário*
            <select value={form.regime} onChange={(e) => update("regime", e.target.value as FormState["regime"])}>
              {REGIMES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
          <label>
            Inscrição estadual
            <input value={form.inscricaoEstadual} onChange={(e) => update("inscricaoEstadual", e.target.value)} />
          </label>
          <label>
            Inscrição municipal
            <input value={form.inscricaoMunicipal} onChange={(e) => update("inscricaoMunicipal", e.target.value)} />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="form-grid two">
          <label className="full">
            Logradouro
            <input value={form.enderecoLogradouro} onChange={(e) => update("enderecoLogradouro", e.target.value)} />
          </label>
          <label>
            Número
            <input value={form.enderecoNumero} onChange={(e) => update("enderecoNumero", e.target.value)} />
          </label>
          <label>
            Complemento
            <input value={form.enderecoComplemento} onChange={(e) => update("enderecoComplemento", e.target.value)} />
          </label>
          <label>
            Bairro
            <input value={form.enderecoBairro} onChange={(e) => update("enderecoBairro", e.target.value)} />
          </label>
          <label>
            Cidade
            <input value={form.enderecoCidade} onChange={(e) => update("enderecoCidade", e.target.value)} />
          </label>
          <label>
            UF*
            <select value={form.enderecoUf} onChange={(e) => update("enderecoUf", e.target.value)}>
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </label>
          <label>
            CEP
            <input value={form.enderecoCep} onChange={(e) => update("enderecoCep", e.target.value)} />
          </label>
          <label>
            Código município IBGE
            <input value={form.codigoMunicipioIbge} onChange={(e) => update("codigoMunicipioIbge", e.target.value)} placeholder="7 dígitos" />
          </label>
          <label>
            Telefone
            <input value={form.telefone} onChange={(e) => update("telefone", e.target.value)} />
          </label>
          <label>
            E-mail fiscal
            <input value={form.email} onChange={(e) => update("email", e.target.value)} />
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="form-grid two">
          <label>
            Provedor de emissão
            <select value={form.provider} onChange={(e) => update("provider", e.target.value as FormState["provider"])}>
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label>
            Ambiente
            <select value={form.environment} onChange={(e) => update("environment", e.target.value as FormState["environment"])}>
              <option value="HOMOLOGACAO">Homologação</option>
              <option value="PRODUCAO">Produção</option>
            </select>
          </label>
          {externalProvider && (
            <>
              <label className="full">
                URL base do provedor*
                <input value={form.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://api.provedor.com.br" />
              </label>
              <label>
                Token de integração{initialData.config.hasToken ? " (já salvo)" : "*"}
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={initialData.config.hasToken ? "•••• manter atual" : ""} />
              </label>
              <label>
                CSC ID (NFC-e)
                <input value={form.cscId} onChange={(e) => update("cscId", e.target.value)} />
              </label>
              <label>
                CSC Token (NFC-e){initialData.config.hasCscToken ? " (já salvo)" : ""}
                <input type="password" value={cscToken} onChange={(e) => setCscToken(e.target.value)} />
              </label>
            </>
          )}
          <label>
            Série NF-e
            <input value={form.serieNfe} onChange={(e) => update("serieNfe", e.target.value)} />
          </label>
          <label>
            Série NFC-e
            <input value={form.serieNfce} onChange={(e) => update("serieNfce", e.target.value)} />
          </label>
          <label>
            Série NFS-e
            <input value={form.serieNfse} onChange={(e) => update("serieNfse", e.target.value)} />
          </label>
          <label className="full">
            Certificado A1 (descrição/identificação)
            <input value={form.certificadoInfo} onChange={(e) => update("certificadoInfo", e.target.value)} placeholder="Ex.: CN, validade — credencial fica com o provedor" />
          </label>
          <fieldset className="full" style={{ display: "flex", gap: 18, flexWrap: "wrap", border: "none", padding: 0 }}>
            <label className="checkbox"><input type="checkbox" checked={form.emitNfe} onChange={(e) => update("emitNfe", e.target.checked)} /> Emitir NF-e</label>
            <label className="checkbox"><input type="checkbox" checked={form.emitNfce} onChange={(e) => update("emitNfce", e.target.checked)} /> Emitir NFC-e</label>
            <label className="checkbox"><input type="checkbox" checked={form.emitNfse} onChange={(e) => update("emitNfse", e.target.checked)} /> Emitir NFS-e</label>
            <label className="checkbox"><input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} /> Ativar emissão</label>
          </fieldset>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="form-grid two">
            <div><span className="field-label">Empresa</span><strong>{form.razaoSocial || "—"}</strong><small>{form.cnpj}</small></div>
            <div><span className="field-label">Regime</span><strong>{regimeLabel(form.regime)}</strong></div>
            <div><span className="field-label">UF de origem</span><strong>{form.enderecoUf || "—"}</strong><small>{form.enderecoCidade}</small></div>
            <div><span className="field-label">Provedor / ambiente</span><strong>{PROVIDERS.find((p) => p.value === form.provider)?.label}</strong><small>{form.environment === "PRODUCAO" ? "Produção" : "Homologação"}</small></div>
            <div><span className="field-label">Documentos</span><strong>{[form.emitNfe && "NF-e", form.emitNfce && "NFC-e", form.emitNfse && "NFS-e"].filter(Boolean).join(" · ") || "Nenhum"}</strong></div>
            <div><span className="field-label">Emissão ativa</span><strong>{form.active ? "Sim" : "Não"}</strong></div>
          </div>

          <label className="checkbox full" style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <input type="checkbox" checked={form.gerarBaseNacional} onChange={(e) => update("gerarBaseNacional", e.target.checked)} />
            <span>
              <strong>Gerar base tributária nacional automaticamente</strong>
              <br />
              <small style={{ color: "var(--erp-muted, #64748b)" }}>
                Cria as regras de ICMS{["LUCRO_PRESUMIDO", "LUCRO_REAL"].includes(form.regime) ? " por UF de destino" : " (CSOSN 102 do Simples)"}, PIS e COFINS de venda para o
                regime {regimeLabel(form.regime)}. Você poderá revisar tudo depois — regras específicas
                sempre prevalecem.
              </small>
            </span>
          </label>
          {initialData.baselineRules > 0 && form.gerarBaseNacional && (
            <div className="alert warn" style={{ marginTop: 12 }}>
              <span>Já existem {initialData.baselineRules} regras-base. Elas serão substituídas pela base atualizada deste regime/UF.</span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
        <Button variant="light" onClick={back} disabled={step === 0 || saving}>Voltar</Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next} disabled={saving}>Avançar</Button>
        ) : (
          <Button onClick={finish} disabled={saving}>{saving ? "Concluindo…" : "Concluir configuração"}</Button>
        )}
      </div>
    </Card>
  );
}
