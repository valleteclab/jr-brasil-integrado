"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/shared/Button";

type Finalidade = "REVENDA" | "USO_CONSUMO" | "IMOBILIZADO" | "INDUSTRIALIZACAO";

const FINALIDADE_OPCOES: Array<{ value: Finalidade; label: string }> = [
  { value: "REVENDA", label: "Revenda" },
  { value: "USO_CONSUMO", label: "Uso e consumo" },
  { value: "IMOBILIZADO", label: "Imobilizado" },
  { value: "INDUSTRIALIZACAO", label: "Industrialização" }
];

const FINALIDADE_LABEL: Record<string, string> = Object.fromEntries(FINALIDADE_OPCOES.map((o) => [o.value, o.label]));

type Regra = {
  id: string;
  nome: string;
  finalidade: Finalidade;
  ncm: string | null;
  cfopOrigem: string | null;
  fornecedorId: string | null;
  prioridade: number;
  ativo: boolean;
  vigenciaInicio: string;
  vigenciaFim: string | null;
};

type FormState = {
  nome: string;
  finalidade: Finalidade;
  ncm: string;
  cfopOrigem: string;
  fornecedorId: string;
  prioridade: string;
};

const EMPTY_FORM: FormState = { nome: "", finalidade: "REVENDA", ncm: "", cfopOrigem: "", fornecedorId: "", prioridade: "100" };

type Props = {
  fornecedores: Array<{ id: string; nome: string }>;
};

export function FinalidadeRulesCrud({ fornecedores }: Props) {
  const [rules, setRules] = useState<Regra[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fornecedorNome = useMemo(() => new Map(fornecedores.map((f) => [f.id, f.nome])), [fornecedores]);

  async function loadRules() {
    try {
      const response = await fetch("/api/erp/regras-finalidade");
      const data = await response.json() as { rules?: Regra[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao carregar regras.");
      setRules(data.rules ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar regras.");
    }
  }

  useEffect(() => {
    void loadRules();
  }, []);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(regra: Regra) {
    setEditingId(regra.id);
    setForm({
      nome: regra.nome,
      finalidade: regra.finalidade,
      ncm: regra.ncm ?? "",
      cfopOrigem: regra.cfopOrigem ?? "",
      fornecedorId: regra.fornecedorId ?? "",
      prioridade: String(regra.prioridade)
    });
  }

  async function save() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        nome: form.nome,
        finalidade: form.finalidade,
        ncm: form.ncm,
        cfopOrigem: form.cfopOrigem,
        fornecedorId: form.fornecedorId,
        prioridade: Number(form.prioridade) || 100
      };
      const url = editingId ? `/api/erp/regras-finalidade/${editingId}` : "/api/erp/regras-finalidade";
      const response = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a regra.");
      setMessage(editingId ? "Regra atualizada." : "Regra cadastrada.");
      resetForm();
      await loadRules();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a regra.");
    } finally {
      setLoading(false);
    }
  }

  async function archive(id: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/erp/regras-finalidade/${id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível inativar a regra.");
      setMessage("Regra inativada.");
      await loadRules();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Não foi possível inativar a regra.");
    }
  }

  return (
    <div className="erp-card">
      <div className="erp-card-head">
        <h3>{editingId ? "Editar regra" : "Nova regra De/Para"}</h3>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert info">{message}</div>}

      <div className="erp-form fiscal-form-grid">
        <label>
          Nome
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Peças NCM 8708 → Revenda" />
        </label>
        <label>
          Finalidade
          <select value={form.finalidade} onChange={(e) => setForm({ ...form, finalidade: e.target.value as Finalidade })}>
            {FINALIDADE_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label>
          NCM (prefixo ou 8 dígitos)
          <input value={form.ncm} onChange={(e) => setForm({ ...form, ncm: e.target.value })} placeholder="Ex.: 8708" inputMode="numeric" />
        </label>
        <label>
          CFOP de origem (do fornecedor)
          <input value={form.cfopOrigem} onChange={(e) => setForm({ ...form, cfopOrigem: e.target.value })} placeholder="Ex.: 5102" inputMode="numeric" />
        </label>
        <label>
          Fornecedor (opcional)
          <select value={form.fornecedorId} onChange={(e) => setForm({ ...form, fornecedorId: e.target.value })}>
            <option value="">Qualquer fornecedor</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
        <label>
          Prioridade <span className="block-muted">(maior número tem precedência)</span>
          <input value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })} inputMode="numeric" placeholder="100" title="Maior número = maior prioridade. Em empate, a regra mais específica (fornecedor > CFOP > NCM) vence." />
        </label>
      </div>
      <p className="block-muted" style={{ margin: "0.25rem 0 0.75rem" }}>
        Defina ao menos um critério (NCM, CFOP de origem ou fornecedor). Em conflito, vence primeiro a regra mais específica
        (fornecedor &gt; CFOP &gt; NCM) e, no empate, a de <strong>maior prioridade</strong>.
      </p>
      <div className="fiscal-step-actions">
        <Button type="button" onClick={save} disabled={loading}>{loading ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar regra"}</Button>
        {editingId && <Button type="button" variant="light" onClick={resetForm}>Cancelar</Button>}
      </div>

      <div className="erp-table-wrap" style={{ marginTop: "1rem" }}>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Finalidade</th>
              <th>NCM</th>
              <th>CFOP orig.</th>
              <th>Fornecedor</th>
              <th className="num">Prior.</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr><td colSpan={8} className="block-muted">Nenhuma regra cadastrada. As entradas usam a heurística padrão.</td></tr>
            ) : (
              rules.map((regra) => (
                <tr key={regra.id} style={{ opacity: regra.ativo ? 1 : 0.5 }}>
                  <td><strong>{regra.nome}</strong></td>
                  <td>{FINALIDADE_LABEL[regra.finalidade] ?? regra.finalidade}</td>
                  <td className="mono">{regra.ncm || "—"}</td>
                  <td className="mono">{regra.cfopOrigem || "—"}</td>
                  <td>{regra.fornecedorId ? (fornecedorNome.get(regra.fornecedorId) ?? "—") : "Qualquer"}</td>
                  <td className="num">{regra.prioridade}</td>
                  <td>{regra.ativo ? <span className="status-badge success">Ativa</span> : <span className="status-badge">Inativa</span>}</td>
                  <td>
                    <div className="fiscal-link-actions">
                      <button type="button" onClick={() => startEdit(regra)}>Editar</button>
                      {regra.ativo && <button type="button" onClick={() => archive(regra.id)}>Inativar</button>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
