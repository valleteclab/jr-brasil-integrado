"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";

type Forma = { id: string; nome: string; tipo: string; contaBancariaId: string | null; contaNome: string | null; ordem: number; ativo: boolean };
type Conta = { id: string; nome: string };

const TIPOS = [
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "PIX", label: "Pix" },
  { value: "CARTAO_CREDITO", label: "Cartão de crédito" },
  { value: "CARTAO_DEBITO", label: "Cartão de débito" },
  { value: "BOLETO", label: "Boleto" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "OUTRO", label: "Outro" }
];

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

const VAZIO = { nome: "", tipo: "DINHEIRO", contaBancariaId: "", ordem: "0" };

export function FormasPagamentoManager({ initial, contas }: { initial: Forma[]; contas: Conta[] }) {
  const [formas, setFormas] = useState(initial);
  const [form, setForm] = useState({ ...VAZIO });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function reset() {
    setForm({ ...VAZIO });
    setEditingId(null);
  }

  function editar(forma: Forma) {
    setEditingId(forma.id);
    setForm({ nome: forma.nome, tipo: forma.tipo, contaBancariaId: forma.contaBancariaId ?? "", ordem: String(forma.ordem) });
    setMessage("");
    setError("");
  }

  async function recarregar() {
    const data = await fetch("/api/erp/configuracoes/formas-pagamento").then((r) => r.json()).catch(() => null) as { formas?: Array<Forma & { contaBancaria?: { nome: string } | null }> } | null;
    if (data?.formas) {
      setFormas(data.formas.map((f) => ({ ...f, contaNome: f.contaBancaria?.nome ?? null })));
    }
  }

  async function salvar() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = { nome: form.nome, tipo: form.tipo, contaBancariaId: form.contaBancariaId || null, ordem: Number(form.ordem) || 0 };
      const url = editingId ? `/api/erp/configuracoes/formas-pagamento/${editingId}` : "/api/erp/configuracoes/formas-pagamento";
      const response = await fetch(url, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a forma de pagamento.");
      await recarregar();
      reset();
      setMessage("Forma de pagamento salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a forma de pagamento.");
    } finally {
      setSaving(false);
    }
  }

  async function inativar(forma: Forma) {
    if (!window.confirm(`Inativar a forma "${forma.nome}"?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/erp/configuracoes/formas-pagamento/${forma.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "Falha ao inativar.");
      await recarregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível inativar a forma.");
    }
  }

  return (
    <section className="erp-card">
      <div className="erp-card-head">
        <div>
          <h3>{editingId ? "Editar forma" : "Nova forma de pagamento"}</h3>
          <span>Como o pagamento é feito. Vincule a uma conta financeira para relatórios.</span>
        </div>
        {editingId && <button type="button" className="btn-erp ghost xs" onClick={reset}>Cancelar edição</button>}
      </div>

      <div className="erp-form">
        <label>
          Nome *
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Pix, Boleto, Cartão Visa crédito" />
        </label>
        <label>
          Tipo *
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label>
          Conta financeira (opcional)
          <select value={form.contaBancariaId} onChange={(e) => setForm({ ...form, contaBancariaId: e.target.value })}>
            <option value="">— Nenhuma —</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label>Ordem<input value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value.replace(/\D/g, "") })} /></label>
      </div>

      {message && <div className="alert info" style={{ margin: "0 16px 12px" }}><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger" style={{ margin: "0 16px 12px" }}><strong>Atenção</strong><span>{error}</span></div>}

      <footer className="inline-foot">
        <Button type="button" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar forma"}</Button>
      </footer>

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr><th>Nome</th><th>Tipo</th><th>Conta vinculada</th><th>Situação</th><th className="actions">Ações</th></tr>
          </thead>
          <tbody>
            {formas.map((forma) => (
              <tr key={forma.id} style={forma.ativo ? undefined : { opacity: 0.55 }}>
                <td><strong>{forma.nome}</strong></td>
                <td>{TIPO_LABEL[forma.tipo] ?? forma.tipo}</td>
                <td>{forma.contaNome ?? "-"}</td>
                <td><StatusBadge tone={forma.ativo ? "success" : "mute"}>{forma.ativo ? "Ativa" : "Inativa"}</StatusBadge></td>
                <td className="actions">
                  <button type="button" className="btn-erp ghost xs" onClick={() => editar(forma)}>Editar</button>
                  {forma.ativo && <button type="button" className="danger-link" onClick={() => inativar(forma)}>Inativar</button>}
                </td>
              </tr>
            ))}
            {!formas.length && <tr><td colSpan={5}><div className="empty-st">Nenhuma forma cadastrada.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
