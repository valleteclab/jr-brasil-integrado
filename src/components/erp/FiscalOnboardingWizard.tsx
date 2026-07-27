"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { useCadastroLookup } from "@/components/erp/useCadastroLookup";
import type { FiscalOnboardingData } from "@/domains/fiscal/application/fiscal-onboarding-use-cases";
import { LC116_LIST, lc116Description } from "@/domains/fiscal/lc116";

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

const STEPS = ["Empresa", "Endereço fiscal", "Documentos", "Certificado A1", "Revisão"];

type FormState = FiscalOnboardingData["empresa"] &
  Omit<FiscalOnboardingData["config"], "hasToken" | "hasCscToken"> & {
    gerarBaseNacional: boolean;
  };

function regimeLabel(value: string) {
  return REGIMES.find((r) => r.value === value)?.label ?? value;
}

export function FiscalOnboardingWizard({
  initialData,
  apiBase = "/api/erp/configuracoes/fiscal"
}: {
  initialData: FiscalOnboardingData;
  apiBase?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ baselineRules: number } | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState("");
  const [certificateInfo, setCertificateInfo] = useState(initialData.certificado);
  const [certificateMessage, setCertificateMessage] = useState("");

  const [form, setForm] = useState<FormState>({
    ...initialData.empresa,
    ...initialData.config,
    gerarBaseNacional: true
  });

  const { buscarCnpj, buscandoCnpj, erro: lookupErro } = useCadastroLookup();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // Autopreenche os dados da empresa (razão social, fantasia, endereço, contato) a partir do CNPJ —
  // mesmo serviço usado nos cadastros do ERP (BrasilAPI/Receita).
  async function preencherPorCnpj() {
    const d = await buscarCnpj(form.cnpj);
    if (!d) return;
    setForm((current) => ({
      ...current,
      razaoSocial: d.razaoSocial ?? current.razaoSocial,
      nomeFantasia: d.nomeFantasia ?? current.nomeFantasia,
      email: d.email ?? current.email,
      telefone: d.telefone ?? current.telefone,
      enderecoLogradouro: d.endereco.logradouro ?? current.enderecoLogradouro,
      enderecoNumero: d.endereco.numero ?? current.enderecoNumero,
      enderecoComplemento: d.endereco.complemento ?? current.enderecoComplemento,
      enderecoBairro: d.endereco.bairro ?? current.enderecoBairro,
      enderecoCidade: d.endereco.cidade ?? current.enderecoCidade,
      enderecoUf: d.endereco.uf ?? current.enderecoUf,
      enderecoCep: d.endereco.cep ?? current.enderecoCep,
      codigoMunicipioIbge: d.endereco.codigoMunicipioIbge ?? current.codigoMunicipioIbge
    }));
  }

  const stepError = useMemo(() => {
    if (step === 0) {
      if (!form.razaoSocial.trim()) return "Informe a razão social.";
      if (!form.cnpj.trim()) return "Informe o CNPJ.";
    }
    if (step === 1) {
      if (!form.enderecoUf.trim()) return "Selecione a UF.";
    }
    if (step === 2) {
      if (!form.emitNfe && !form.emitNfce && !form.emitNfse) return "Selecione ao menos um tipo de nota.";
      if (form.emitNfe && form.proximoNumeroNfe < 1) return "Informe o próximo número da NF-e.";
      if (form.emitNfce && form.proximoNumeroNfce < 1) return "Informe o próximo número da NFC-e.";
      if (form.emitNfse && form.proximoNumeroNfse < 1) return "Informe o próximo número da NFS-e.";
      if (form.emitNfse && !form.inscricaoMunicipal.trim()) return "Informe a inscrição municipal para emitir NFS-e.";
      if (form.emitNfse && !form.codigoMunicipioIbge.trim()) return "Informe o código IBGE do município para a NFS-e.";
      if (form.emitNfse && !form.codigoServicoLc116Padrao) return "Selecione o serviço principal na LC 116.";
      if (form.emitNfse && !form.descricaoServicoPadrao.trim()) return "Informe a descrição padrão do serviço.";
    }
    if (step === 3 && !certificateInfo) {
      if (!certificateFile) return "Selecione o certificado A1 (.pfx ou .p12).";
      if (!certificatePassword.trim()) return "Informe a senha do certificado A1.";
    }
    return "";
  }, [step, form, certificateFile, certificatePassword, certificateInfo]);

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
      if (!certificateInfo && certificateFile) {
        const certificateForm = new FormData();
        certificateForm.append("file", certificateFile);
        certificateForm.append("password", certificatePassword);
        const certificateResponse = await fetch(`${apiBase}/certificado`, { method: "POST", body: certificateForm });
        const certificatePayload = await certificateResponse.json();
        if (!certificateResponse.ok) {
          throw new Error(certificatePayload.error || "Erro ao salvar o certificado A1.");
        }
        setCertificateInfo({
          titularCnpj: certificatePayload.titularCnpj ?? null,
          validade: certificatePayload.validade ?? null,
          arquivoNome: certificatePayload.arquivoNome ?? certificateFile.name
        });
        setCertificateMessage(certificatePayload.message || "Certificado A1 salvo com segurança.");
      }
      const response = await fetch(`${apiBase}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razaoSocial: form.razaoSocial,
          nomeFantasia: form.nomeFantasia,
          cnpj: form.cnpj,
          inscricaoEstadual: form.inscricaoEstadual,
          inscricaoMunicipal: form.inscricaoMunicipal,
          regime: form.regime,
          tipoNegocio: form.tipoNegocio,
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
          // Provedor e credenciais são GLOBAIS (/admin/provedor-fiscal) — não enviados pela empresa.
          environment: form.environment,
          serieNfe: form.serieNfe,
          serieNfce: form.serieNfce,
          serieNfse: form.serieNfse,
          proximoNumeroNfe: form.proximoNumeroNfe,
          proximoNumeroNfce: form.proximoNumeroNfce,
          proximoNumeroNfse: form.proximoNumeroNfse,
          emitNfe: form.emitNfe,
          emitNfce: form.emitNfce,
          emitNfse: form.emitNfse,
          codigoServicoLc116Padrao: form.codigoServicoLc116Padrao,
          descricaoServicoPadrao: form.descricaoServicoPadrao,
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
            <span style={{ display: "flex", gap: 6 }}>
              <input value={form.cnpj} onChange={(e) => update("cnpj", e.target.value.toUpperCase())} placeholder="00.000.000/0001-00" maxLength={18} style={{ flex: 1 }} />
              <button type="button" className="btn-erp light sm" onClick={preencherPorCnpj} disabled={buscandoCnpj} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                {buscandoCnpj ? "Buscando…" : "Buscar CNPJ"}
              </button>
            </span>
            {lookupErro && <small className="form-error">{lookupErro}</small>}
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
            Tipo de negócio*
            <select value={form.tipoNegocio} onChange={(e) => update("tipoNegocio", e.target.value as FormState["tipoNegocio"])}>
              <option value="VENDA">Vendas (peças / material)</option>
              <option value="SERVICO">Serviços</option>
              <option value="AMBOS">Vendas & Serviços</option>
            </select>
          </label>
          <label>
            Inscrição estadual
            <input value={form.inscricaoEstadual} onChange={(e) => update("inscricaoEstadual", e.target.value)} />
          </label>
          <label>
            Inscrição municipal (necessária para NFS-e)
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
          <div className="full alert info" style={{ margin: 0 }}>
            <strong>Quais notas sua empresa vai emitir?</strong>
            <span>
              Marque somente os documentos usados no dia a dia. Para cada um, informe a série e o
              próximo número de produção para continuar a numeração atual sem duplicidade.
            </span>
          </div>
          <fieldset className="full" style={{ display: "flex", gap: 18, flexWrap: "wrap", border: "none", padding: 0 }}>
            <label className="checkbox"><input type="checkbox" checked={form.emitNfe} onChange={(e) => update("emitNfe", e.target.checked)} /> NF-e · produtos (modelo 55)</label>
            <label className="checkbox"><input type="checkbox" checked={form.emitNfce} onChange={(e) => update("emitNfce", e.target.checked)} /> NFC-e · consumidor (modelo 65)</label>
            <label className="checkbox"><input type="checkbox" checked={form.emitNfse} onChange={(e) => update("emitNfse", e.target.checked)} /> NFS-e · serviços</label>
          </fieldset>
          <label>
            Ambiente
            <select value={form.environment} onChange={(e) => update("environment", e.target.value as FormState["environment"])}>
              <option value="HOMOLOGACAO">Homologação</option>
              <option value="PRODUCAO">Produção</option>
            </select>
          </label>
          <label className="checkbox" style={{ alignSelf: "end", marginBottom: 10 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} /> Ativar emissão ao concluir
          </label>

          {form.emitNfe && (<>
            <label>Série NF-e
              <input value={form.serieNfe} onChange={(e) => update("serieNfe", e.target.value)} />
            </label>
            <label>Próximo número da NF-e
              <input type="number" min={1} value={form.proximoNumeroNfe} onChange={(e) => update("proximoNumeroNfe", Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </>)}

          {form.emitNfce && (<>
            <label>Série NFC-e
              <input value={form.serieNfce} onChange={(e) => update("serieNfce", e.target.value)} />
            </label>
            <label>Próximo número da NFC-e
              <input type="number" min={1} value={form.proximoNumeroNfce} onChange={(e) => update("proximoNumeroNfce", Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </>)}

          {form.emitNfse && (<>
            <label>Série NFS-e / DPS
              <input value={form.serieNfse} onChange={(e) => update("serieNfse", e.target.value)} />
            </label>
            <label>Próximo número da NFS-e / DPS
              <input type="number" min={1} value={form.proximoNumeroNfse} onChange={(e) => update("proximoNumeroNfse", Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <label className="full">
              Serviço principal · Lista da LC 116
              <select
                value={form.codigoServicoLc116Padrao}
                onChange={(e) => {
                  const previousOfficial = lc116Description(form.codigoServicoLc116Padrao) ?? "";
                  const nextCode = e.target.value;
                  const nextOfficial = lc116Description(nextCode) ?? "";
                  update("codigoServicoLc116Padrao", nextCode);
                  if (!form.descricaoServicoPadrao.trim() || form.descricaoServicoPadrao === previousOfficial) {
                    update("descricaoServicoPadrao", nextOfficial);
                  }
                }}
              >
                <option value="">Selecione o serviço principal...</option>
                {LC116_LIST.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.description}</option>)}
              </select>
            </label>
            <label className="full">
              Descrição padrão do serviço
              <textarea
                value={form.descricaoServicoPadrao}
                onChange={(e) => update("descricaoServicoPadrao", e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Personalize como o serviço deve aparecer na NFS-e. Você poderá alterar em cada emissão."
              />
              <small>Começamos com a descrição oficial da LC 116; personalize para refletir o serviço realmente prestado.</small>
            </label>
            <div className="full alert info" style={{ margin: 0 }}>
              <span>
                Para NFS-e também usaremos a inscrição municipal e o código IBGE informados nas etapas anteriores.
                O NBS e a classificação tributária são sugeridos automaticamente a partir da LC 116.
              </span>
            </div>
          </>)}
        </div>
      )}

      {step === 3 && (
        <div className="form-grid two">
          <div className="full alert info" style={{ margin: 0 }}>
            <strong>Certificado digital A1</strong>
            <span>O arquivo e a senha são criptografados e usados para assinar as notas. Eles nunca são exibidos novamente.</span>
          </div>
          {certificateInfo ? (
            <div className="full alert success" style={{ margin: 0 }}>
              <strong>Certificado já configurado</strong>
              <span>
                {certificateInfo.arquivoNome || "Certificado A1"}
                {certificateInfo.titularCnpj ? ` · CNPJ ${certificateInfo.titularCnpj}` : ""}
                {certificateInfo.validade ? ` · válido até ${new Date(certificateInfo.validade).toLocaleDateString("pt-BR")}` : ""}
              </span>
            </div>
          ) : (<>
            <label>Arquivo A1 (.pfx ou .p12)
              <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={(e) => setCertificateFile(e.target.files?.[0] ?? null)} />
            </label>
            <label>Senha do certificado
              <input type="password" value={certificatePassword} onChange={(e) => setCertificatePassword(e.target.value)} autoComplete="off" />
            </label>
          </>)}
          {certificateMessage && <div className="full alert success" style={{ margin: 0 }}><span>{certificateMessage}</span></div>}
        </div>
      )}

      {step === 4 && (
        <div>
          <div className="form-grid two">
            <div><span className="field-label">Empresa</span><strong>{form.razaoSocial || "—"}</strong><small>{form.cnpj}</small></div>
            <div><span className="field-label">Regime</span><strong>{regimeLabel(form.regime)}</strong></div>
            <div><span className="field-label">UF de origem</span><strong>{form.enderecoUf || "—"}</strong><small>{form.enderecoCidade}</small></div>
            <div><span className="field-label">Ambiente</span><strong>{form.environment === "PRODUCAO" ? "Produção" : "Homologação"}</strong><small>Provedor: definido pela plataforma</small></div>
            <div><span className="field-label">Documentos</span><strong>{[form.emitNfe && "NF-e", form.emitNfce && "NFC-e", form.emitNfse && "NFS-e"].filter(Boolean).join(" · ") || "Nenhum"}</strong></div>
            <div><span className="field-label">Emissão ativa</span><strong>{form.active ? "Sim" : "Não"}</strong></div>
            {form.emitNfe && <div><span className="field-label">NF-e</span><strong>Série {form.serieNfe} · próxima {form.proximoNumeroNfe}</strong></div>}
            {form.emitNfce && <div><span className="field-label">NFC-e</span><strong>Série {form.serieNfce} · próxima {form.proximoNumeroNfce}</strong></div>}
            {form.emitNfse && <div><span className="field-label">NFS-e</span><strong>Série {form.serieNfse} · próxima {form.proximoNumeroNfse}</strong><small>{form.codigoServicoLc116Padrao} · {form.descricaoServicoPadrao}</small></div>}
            <div><span className="field-label">Certificado</span><strong>{certificateInfo?.arquivoNome || certificateFile?.name || "A1 selecionado"}</strong></div>
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
