"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { TaxRuleSummary } from "@/lib/services/tax-rules";

type TaxRulesCrudProps = {
  initialRules: TaxRuleSummary[];
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
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: "",
  active: true,
  notes: ""
};

const taxOptions = ["ICMS", "IPI", "PIS", "COFINS", "ISS", "CBS", "IBS", "IS"] as const;
const operationOptions = ["COMPRA", "VENDA", "DEVOLUCAO_COMPRA", "DEVOLUCAO_VENDA", "TRANSFERENCIA", "REMESSA", "RETORNO"] as const;

export function TaxRulesCrud({ initialRules }: TaxRulesCrudProps) {
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
      <div className="erp-page-actions product-actions">
        <div className="product-search">
          <span aria-hidden="true">⌕</span>
          <input placeholder="Buscar regra, NCM, CFOP, CST..." value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="toolbar-grow" />
        <Button type="button" onClick={openNew}>+ Nova regra</Button>
      </div>

      {error && !drawerOpen && <div className="alert danger product-import-alert"><strong>Atenção</strong><span>{error}</span></div>}

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
                <td><strong>{rule.name}</strong><small className="block-muted">{rule.companyRegime || "Regime não informado"}</small></td>
                <td>{rule.tax}</td>
                <td>{rule.operation}</td>
                <td>{rule.ncm || "-"}{rule.cest ? <small className="block-muted">CEST {rule.cest}</small> : null}</td>
                <td>{rule.cfop || "-"}</td>
                <td>{rule.cst || rule.csosn || "-"}</td>
                <td className="num">{rule.rate ? `${rule.rate}%` : "-"}</td>
                <td><StatusBadge tone={rule.active ? "success" : "mute"}>{rule.active ? "Ativa" : "Inativa"}</StatusBadge></td>
                <td className="actions">
                  <Button variant="light" type="button" onClick={() => openEdit(rule)}>Abrir</Button>
                  {rule.active && <button className="danger-link" type="button" onClick={() => archiveRule(rule)}>Inativar</button>}
                </td>
              </tr>
            ))}
            {!filteredRules.length && (
              <tr><td colSpan={9}><div className="empty-st">Nenhuma regra tributária cadastrada.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {drawerOpen && (
        <>
          <div className="drawer-bd" onClick={closeDrawer} />
          <aside className="drawer product-drawer">
            <header className="drawer-head">
              <div>
                <span className="section-kicker">Fiscal</span>
                <h2>{form.id ? "Editar regra tributária" : "Nova regra tributária"}</h2>
                <p>Revise as regras com o responsável fiscal antes de emitir NF-e.</p>
              </div>
              <button type="button" onClick={closeDrawer}>Fechar</button>
            </header>

            {message && <div className="alert info fiscal-list-alert"><strong>IA</strong><span>{message}</span></div>}
            {error && <div className="alert danger drawer-error"><strong>Atenção</strong><span>{error}</span></div>}

            <div className="drawer-body">
              <div className="erp-form tax-rule-form">
                <label className="full">Nome da regra<input value={form.name} onChange={(event) => updateField("name", event.target.value)} /></label>
                <label>Tributo<select value={form.tax} onChange={(event) => updateField("tax", event.target.value as TaxRuleForm["tax"])}>{taxOptions.map((tax) => <option key={tax}>{tax}</option>)}</select></label>
                <label>Operação<select value={form.operation} onChange={(event) => updateField("operation", event.target.value as TaxRuleForm["operation"])}>{operationOptions.map((operation) => <option key={operation}>{operation}</option>)}</select></label>
                <label>Regime da empresa<input placeholder="Simples Nacional, Lucro Presumido..." value={form.companyRegime} onChange={(event) => updateField("companyRegime", event.target.value)} /></label>
                <label>UF origem<input maxLength={2} value={form.originState} onChange={(event) => updateField("originState", event.target.value.toUpperCase())} /></label>
                <label>UF destino<input maxLength={2} value={form.destinationState} onChange={(event) => updateField("destinationState", event.target.value.toUpperCase())} /></label>
                <label>NCM<input value={form.ncm} onChange={(event) => updateField("ncm", event.target.value)} /></label>
                <label>CEST<input value={form.cest} onChange={(event) => updateField("cest", event.target.value)} /></label>
                <label>CFOP<input value={form.cfop} onChange={(event) => updateField("cfop", event.target.value)} /></label>
                <label>CST<input value={form.cst} onChange={(event) => updateField("cst", event.target.value)} /></label>
                <label>CSOSN<input value={form.csosn} onChange={(event) => updateField("csosn", event.target.value)} /></label>
                <label>cClassTrib<input value={form.taxClass} onChange={(event) => updateField("taxClass", event.target.value)} /></label>
                <label>Cód. benefício<input value={form.benefitCode} onChange={(event) => updateField("benefitCode", event.target.value)} /></label>
                <label>Alíquota %<input value={form.rate} onChange={(event) => updateField("rate", event.target.value)} /></label>
                <label>Redução base %<input value={form.baseReduction} onChange={(event) => updateField("baseReduction", event.target.value)} /></label>
                <label>Diferimento %<input value={form.deferral} onChange={(event) => updateField("deferral", event.target.value)} /></label>
                <label>Crédito presumido %<input value={form.presumedCredit} onChange={(event) => updateField("presumedCredit", event.target.value)} /></label>
                <label>MVA % (ICMS-ST)<input value={form.mva} onChange={(event) => updateField("mva", event.target.value)} /></label>
                <label>Alíquota ICMS-ST %<input value={form.stRate} onChange={(event) => updateField("stRate", event.target.value)} /></label>
                <label>FCP %<input value={form.fcp} onChange={(event) => updateField("fcp", event.target.value)} /></label>
                <label>Vigência início<input type="date" value={form.validFrom} onChange={(event) => updateField("validFrom", event.target.value)} /></label>
                <label>Vigência fim<input type="date" value={form.validUntil} onChange={(event) => updateField("validUntil", event.target.value)} /></label>
                <label className="check-row"><input checked={form.active} type="checkbox" onChange={(event) => updateField("active", event.target.checked)} /> Regra ativa</label>
                <label className="full">Contexto para IA<textarea placeholder="Ex.: venda interna BA de produto alimentício para contribuinte..." value={form.notes ?? ""} onChange={(event) => updateField("notes", event.target.value)} /></label>
              </div>
            </div>

            <footer className="drawer-foot">
              <Button variant="light" type="button" onClick={askAi} disabled={askingAi}>{askingAi ? "Consultando IA..." : "Sugerir com IA"}</Button>
              <Button variant="light" type="button" onClick={closeDrawer}>Cancelar</Button>
              <Button type="button" onClick={saveRule} disabled={saving}>{saving ? "Salvando..." : "Salvar regra"}</Button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
