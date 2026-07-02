"use client";

import { useMemo, useState } from "react";
import type { TaxRuleSummary } from "@/lib/services/tax-rules";

type TaxRulesCrudProps = {
  initialRules: TaxRuleSummary[];
  /** Códigos fiscais (CFOP, CST_*, CSOSN) — alimentam os seletores do formulário. */
  fiscalCodes?: Record<string, { codigo: string; descricao: string }[]>;
};

type TaxRuleForm = Omit<TaxRuleSummary, "id"> & { id?: string; notes?: string };

const emptyForm: TaxRuleForm = {
  name: "",
  tax: "ICMS",
  operation: "VENDA",
  originState: "BA",
  destinationState: "",
  companyRegime: "",
  ncm: "",
  cest: "",
  cfop: "",
  cst: "",
  csosn: "",
  taxClass: "",
  benefitCode: "",
  rate: "",
  baseReduction: "",
  deferral: "",
  presumedCredit: "",
  mva: "",
  stRate: "",
  fcp: "",
  gnreReceita: "",
  gnreProduto: "",
  gnreTipoDocOrigem: "",
  gnreDetalhamento: "",
  gnreCamposExtras: "",
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: "",
  active: true,
  notes: ""
};

const taxOptions = ["ICMS", "IPI", "PIS", "COFINS", "ISS", "CBS", "IBS", "IS"] as const;
const operationOptions = ["COMPRA", "VENDA", "DEVOLUCAO_COMPRA", "DEVOLUCAO_VENDA", "TRANSFERENCIA", "REMESSA", "RETORNO"] as const;

export function TaxRulesCrud({ initialRules, fiscalCodes = {} }: TaxRulesCrudProps) {
  const [rules, setRules] = useState(initialRules);
  const [form, setForm] = useState<TaxRuleForm>(emptyForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [askingAi, setAskingAi] = useState(false);

  const filteredRules = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return rules;
    }

    return rules.filter((rule) => [
      rule.name,
      rule.tax,
      rule.operation,
      rule.ncm,
      rule.cest,
      rule.cfop,
      rule.cst,
      rule.csosn
    ].some((field) => field.toLowerCase().includes(normalized)));
  }, [query, rules]);

  // Listas de códigos fiscais para os seletores (datalist) do formulário.
  const cfopOpcoes = useMemo(() => fiscalCodes.CFOP ?? [], [fiscalCodes]);
  const csosnOpcoes = useMemo(() => fiscalCodes.CSOSN ?? [], [fiscalCodes]);
  // CST: a lista depende do tributo selecionado (ICMS/IPI/PIS/COFINS), com fallback CST_ICMS.
  const cstOpcoes = useMemo(() => {
    const porTributo: Record<string, string> = {
      ICMS: "CST_ICMS",
      IPI: "CST_IPI",
      PIS: "CST_PIS",
      COFINS: "CST_COFINS"
    };
    const tipo = porTributo[form.tax] ?? "CST_ICMS";
    return fiscalCodes[tipo] ?? [];
  }, [fiscalCodes, form.tax]);
  // Descrição do código atualmente selecionado (mostrada no field-hint abaixo do input).
  function descricaoCodigo(opcoes: { codigo: string; descricao: string }[], codigo: string) {
    const alvo = codigo.trim();
    if (!alvo) return "";
    return opcoes.find((opcao) => opcao.codigo === alvo)?.descricao ?? "";
  }

  function openNew() {
    setForm(emptyForm);
    setError("");
    setMessage("");
    setDrawerOpen(true);
  }

  function openEdit(rule: TaxRuleSummary) {
    setForm({ ...rule, notes: "" });
    setError("");
    setMessage("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setForm(emptyForm);
    setError("");
    setDrawerOpen(false);
  }

  function updateField<Key extends keyof TaxRuleForm>(key: Key, value: TaxRuleForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function reloadRules() {
    const response = await fetch("/api/erp/regras-tributarias");
    const data = await response.json() as { rules?: TaxRuleSummary[]; error?: string };

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível recarregar regras tributárias.");
    }

    setRules(data.rules ?? []);
  }

  async function saveRule() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(form.id ? `/api/erp/regras-tributarias/${form.id}` : "/api/erp/regras-tributarias", {
        body: JSON.stringify(form),
        headers: { "Content-Type": "application/json" },
        method: form.id ? "PUT" : "POST"
      });
      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar a regra tributária.");
      }

      await reloadRules();
      closeDrawer();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a regra tributária.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveRule(rule: TaxRuleSummary) {
    if (!window.confirm(`Inativar a regra tributária "${rule.name}"?`)) {
      return;
    }

    setError("");

    try {
      const response = await fetch(`/api/erp/regras-tributarias/${rule.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível inativar a regra tributária.");
      }

      await reloadRules();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Não foi possível inativar a regra tributária.");
    }
  }

  async function askAi() {
    setAskingAi(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/erp/regras-tributarias/assistente", {
        body: JSON.stringify(form),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = await response.json() as { suggestion?: Partial<TaxRuleForm>; warning?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível consultar o assistente fiscal.");
      }

      const suggestion = data.suggestion ?? {};
      setForm((current) => ({
        ...current,
        ...suggestion,
        active: typeof suggestion.active === "boolean" ? suggestion.active : current.active
      }));
      setMessage(data.warning || "Sugestão aplicada para revisão.");
    } catch (aiError) {
      setError(aiError instanceof Error ? aiError.message : "Não foi possível consultar o assistente fiscal.");
    } finally {
      setAskingAi(false);
    }
  }

  return (
    <>
      <div className="erp-toolbar">
        <div className="toolbar-search">
          <span className="ic-sr" aria-hidden="true">⌕</span>
          <input className="search" placeholder="Buscar regra, NCM, CFOP, CST..." value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="grow" />
        <button type="button" className="btn-erp primary sm" onClick={openNew}>+ Nova regra</button>
      </div>

      {error && !drawerOpen && <div className="alert danger" style={{ marginTop: 12 }}><span className="lead">Atenção:</span><span>{error}</span></div>}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Regra</th>
              <th>Tributo</th>
              <th>Operação</th>
              <th>NCM/CEST</th>
              <th>CFOP</th>
              <th>CST/CSOSN</th>
              <th className="num">Alíquota</th>
              <th>Status</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{rule.name}</div>
                  <span className="sublabel">{rule.companyRegime || "Regime não informado"}</span>
                </td>
                <td>{rule.tax}</td>
                <td>{rule.operation}</td>
                <td>{rule.ncm || "-"}{rule.cest ? <span className="sublabel">CEST {rule.cest}</span> : null}</td>
                <td>{rule.cfop || "-"}</td>
                <td>{rule.cst || rule.csosn || "-"}</td>
                <td className="num">{rule.rate ? `${rule.rate}%` : "-"}</td>
                <td>
                  <span className={`pill ${rule.active ? "success" : "mute"}`}>
                    <span className="dot" />
                    {rule.active ? "Ativa" : "Inativa"}
                  </span>
                </td>
                <td className="actions">
                  <button type="button" className="btn-erp ghost xs" onClick={() => openEdit(rule)}>Abrir</button>
                  {rule.active && <button type="button" className="btn-erp danger xs" onClick={() => archiveRule(rule)}>Inativar</button>}
                </td>
              </tr>
            ))}
            {!filteredRules.length && (
              <tr><td colSpan={9}><div className="empty-st"><h4>Nenhuma regra tributária</h4><p>Cadastre a primeira regra tributária.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {drawerOpen && (
        <>
          <div className="drawer-bd" onClick={closeDrawer} />
          <aside className="drawer">
            <div className="drawer-head">
              <div>
                <h2>{form.id ? "Editar regra tributária" : "Nova regra tributária"}</h2>
                <p className="erp-page-sub">Revise as regras com o responsável fiscal antes de emitir NF-e.</p>
              </div>
              <button type="button" className="btn-erp ghost sm" onClick={closeDrawer}>Fechar</button>
            </div>

            <div className="drawer-body">
              {message && <div className="alert info" style={{ margin: "12px 16px 0" }}><span className="lead">IA:</span><span>{message}</span></div>}
              {error && <div className="alert danger" style={{ margin: "12px 16px 0" }}><span className="lead">Atenção:</span><span>{error}</span></div>}

              <div className="erp-form">
                <label className="full">Nome da regra<input value={form.name} onChange={(event) => updateField("name", event.target.value)} /></label>
                <label>Tributo<select value={form.tax} onChange={(event) => updateField("tax", event.target.value as TaxRuleForm["tax"])}>{taxOptions.map((tax) => <option key={tax}>{tax}</option>)}</select></label>
                <label>Operação<select value={form.operation} onChange={(event) => updateField("operation", event.target.value as TaxRuleForm["operation"])}>{operationOptions.map((operation) => <option key={operation}>{operation}</option>)}</select></label>
                <label>Regime da empresa<input placeholder="Simples Nacional, Lucro Presumido..." value={form.companyRegime} onChange={(event) => updateField("companyRegime", event.target.value)} /></label>
                <label>UF origem<input maxLength={2} value={form.originState} onChange={(event) => updateField("originState", event.target.value.toUpperCase())} /></label>
                <label>UF destino<input maxLength={2} value={form.destinationState} onChange={(event) => updateField("destinationState", event.target.value.toUpperCase())} /></label>
                <label>NCM<input value={form.ncm} onChange={(event) => updateField("ncm", event.target.value)} /></label>
                <label>CEST<input value={form.cest} onChange={(event) => updateField("cest", event.target.value)} /></label>
                <label>CFOP<input list="cfop-opcoes" value={form.cfop} onChange={(event) => updateField("cfop", event.target.value)} />{descricaoCodigo(cfopOpcoes, form.cfop) && <small className="field-hint">{descricaoCodigo(cfopOpcoes, form.cfop)}</small>}</label>
                <label>CST<input list="cst-opcoes" value={form.cst} onChange={(event) => updateField("cst", event.target.value)} />{descricaoCodigo(cstOpcoes, form.cst) && <small className="field-hint">{descricaoCodigo(cstOpcoes, form.cst)}</small>}</label>
                <label>CSOSN<input list="csosn-opcoes" value={form.csosn} onChange={(event) => updateField("csosn", event.target.value)} />{descricaoCodigo(csosnOpcoes, form.csosn) && <small className="field-hint">{descricaoCodigo(csosnOpcoes, form.csosn)}</small>}</label>
                <datalist id="cfop-opcoes">
                  {cfopOpcoes.map((opcao) => <option key={opcao.codigo} value={opcao.codigo}>{opcao.codigo + " — " + opcao.descricao}</option>)}
                </datalist>
                <datalist id="cst-opcoes">
                  {cstOpcoes.map((opcao) => <option key={opcao.codigo} value={opcao.codigo}>{opcao.codigo + " — " + opcao.descricao}</option>)}
                </datalist>
                <datalist id="csosn-opcoes">
                  {csosnOpcoes.map((opcao) => <option key={opcao.codigo} value={opcao.codigo}>{opcao.codigo + " — " + opcao.descricao}</option>)}
                </datalist>
                <label>cClassTrib<input value={form.taxClass} onChange={(event) => updateField("taxClass", event.target.value)} /></label>
                <label>Cód. benefício<input value={form.benefitCode} onChange={(event) => updateField("benefitCode", event.target.value)} /></label>
                <label>Alíquota %<input value={form.rate} onChange={(event) => updateField("rate", event.target.value)} /></label>
                <label>Redução base %<input value={form.baseReduction} onChange={(event) => updateField("baseReduction", event.target.value)} /></label>
                <label>Diferimento %<input value={form.deferral} onChange={(event) => updateField("deferral", event.target.value)} /></label>
                <label>Crédito presumido %<input value={form.presumedCredit} onChange={(event) => updateField("presumedCredit", event.target.value)} /></label>
                <label>MVA % (ICMS-ST)<input value={form.mva} onChange={(event) => updateField("mva", event.target.value)} /></label>
                <label>Alíquota ICMS-ST %<input value={form.stRate} onChange={(event) => updateField("stRate", event.target.value)} /><small className="field-hint">Alíquota interna da UF de destino</small></label>
                <label>FCP %<input value={form.fcp} onChange={(event) => updateField("fcp", event.target.value)} /></label>
                <label>Receita GNRE<input maxLength={6} placeholder="100099" value={form.gnreReceita} onChange={(event) => updateField("gnreReceita", event.target.value)} /><small className="field-hint">Código da UF destino: 100099 ST por Operação · 100048 por Apuração</small></label>
                <label>Produto GNRE<input maxLength={4} placeholder="20" value={form.gnreProduto} onChange={(event) => updateField("gnreProduto", event.target.value)} /><small className="field-hint">Tabela da UF (autopeças: 20; MA usa 90) — só se a UF exigir</small></label>
                <label>Doc. origem GNRE<select value={form.gnreTipoDocOrigem} onChange={(event) => updateField("gnreTipoDocOrigem", event.target.value)}><option value="">10 — Nº da nota (padrão)</option><option value="10">10 — Nº da nota</option><option value="22">22 — Chave da NF-e</option></select><small className="field-hint">MT e PA só aceitam a chave (22)</small></label>
                <label>Detalhamento GNRE<input maxLength={6} placeholder="000017" value={form.gnreDetalhamento} onChange={(event) => updateField("gnreDetalhamento", event.target.value)} /><small className="field-hint">Se a UF exigir (TO 000003 · MT 000017 · MA 000020)</small></label>
                <label className="full">Campos extras GNRE<input placeholder='[{"codigo":"38","valor":"{CHAVE}"}]' value={form.gnreCamposExtras} onChange={(event) => updateField("gnreCamposExtras", event.target.value)} /><small className="field-hint">JSON exigido por algumas UFs; {"{CHAVE}"} e {"{NUMERO}"} são preenchidos com os dados da nota</small></label>
                <label>Vigência início<input type="date" value={form.validFrom} onChange={(event) => updateField("validFrom", event.target.value)} /></label>
                <label>Vigência fim<input type="date" value={form.validUntil} onChange={(event) => updateField("validUntil", event.target.value)} /></label>
                <label className="check-row"><input checked={form.active} type="checkbox" onChange={(event) => updateField("active", event.target.checked)} /> Regra ativa</label>
                <label className="full">Contexto para IA<textarea placeholder="Ex.: venda interna BA de produto alimentício para contribuinte..." value={form.notes ?? ""} onChange={(event) => updateField("notes", event.target.value)} /></label>
              </div>
            </div>

            <div className="drawer-foot">
              <button type="button" className="btn-erp ghost sm" onClick={askAi} disabled={askingAi}>{askingAi ? "Consultando IA..." : "Sugerir com IA"}</button>
              <button type="button" className="btn-erp ghost sm" onClick={closeDrawer}>Cancelar</button>
              <button type="button" className="btn-erp primary sm" onClick={saveRule} disabled={saving}>{saving ? "Salvando..." : "Salvar regra"}</button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
