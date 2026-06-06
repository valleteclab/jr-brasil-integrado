"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";

type Conta = { id: string; nome: string; tipo: string; banco: string; agencia: string; conta: string; saldoInicial: number; ativo: boolean };

const TIPOS = [
  { value: "CAIXA", label: "Caixa (dinheiro)" },
  { value: "CORRENTE", label: "Conta corrente" },
  { value: "POUPANCA", label: "Conta poupança" },
  { value: "CARTAO", label: "Cartão" }
];

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

const VAZIO = { nome: "", tipo: "CAIXA", banco: "", agencia: "", conta: "", saldoInicial: "0" };

export function ContasFinanceirasManager({ initial }: { initial: Conta[] }) {
  const [contas, setContas] = useState(initial);
  const [form, setForm] = useState({ ...VAZIO });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const ehConta = form.tipo === "CORRENTE" || form.tipo === "POUPANCA";

  function reset() {
    setForm({ ...VAZIO });
    setEditingId(null);
  }

  function editar(conta: Conta) {
    setEditingId(conta.id);
    setForm({
      nome: conta.nome,
      tipo: conta.tipo,
      banco: conta.banco,
      agencia: conta.agencia,
      conta: conta.conta,
      saldoInicial: String(conta.saldoInicial)
    });
    setMessage("");
    setError("");
  }

  async function recarregar() {
    const data = await fetch("/api/erp/configuracoes/contas-financeiras").then((r) => r.json()).catch(() => null) as { contas?: Conta[] } | null;
    if (data?.contas) setContas(data.contas.map((c) => ({ ...c, saldoInicial: Number(c.saldoInicial) })));
  }

  async function salvar() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = { ...form, saldoInicial: Number(form.saldoInicial.replace(",", ".")) || 0 };
      const url = editingId ? `/api/erp/configuracoes/contas-financeiras/${editingId}` : "/api/erp/configuracoes/contas-financeiras";
      const response = await fetch(url, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a conta.");
      await recarregar();
      reset();
      setMessage("Conta financeira salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a conta.");
    } finally {
      setSaving(false);
    }
  }

  async function inativar(conta: Conta) {
    if (!window.confirm(`Inativar a conta "${conta.nome}"?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/erp/configuracoes/contas-financeiras/${conta.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "Falha ao inativar.");
      await recarregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível inativar a conta.");
    }
  }

  return (
    <section className="erp-card">
      <div className="erp-card-head">
        <div>
          <h3>{editingId ? "Editar conta" : "Nova conta financeira"}</h3>
          <span>Caixa, banco ou cartão de onde a empresa paga suas contas.</span>
        </div>
        {editingId && <button type="button" className="btn-erp ghost xs" onClick={reset}>Cancelar edição</button>}
      </div>

      <div className="erp-form">
        <label>
          Nome *
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Caixa loja, Itaú PJ, Cartão Nubank" />
        </label>
        <label>
          Tipo *
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {ehConta && (
          <>
            <label>Banco<input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} /></label>
            <label>Agência<input value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} /></label>
            <label>Conta<input value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} /></label>
          </>
        )}
        {!editingId && (
          <label>Saldo inicial<input value={form.saldoInicial} onChange={(e) => setForm({ ...form, saldoInicial: e.target.value })} /></label>
        )}
      </div>

      {message && <div className="alert info" style={{ margin: "0 16px 12px" }}><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger" style={{ margin: "0 16px 12px" }}><strong>Atenção</strong><span>{error}</span></div>}

      <footer className="inline-foot">
        <Button type="button" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar conta"}</Button>
      </footer>

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr><th>Nome</th><th>Tipo</th><th>Banco/Conta</th><th>Situação</th><th className="actions">Ações</th></tr>
          </thead>
          <tbody>
            {contas.map((conta) => (
              <tr key={conta.id} style={conta.ativo ? undefined : { opacity: 0.55 }}>
                <td><strong>{conta.nome}</strong></td>
                <td>{TIPO_LABEL[conta.tipo] ?? conta.tipo}</td>
                <td>{[conta.banco, conta.agencia, conta.conta].filter(Boolean).join(" · ") || "-"}</td>
                <td><StatusBadge tone={conta.ativo ? "success" : "mute"}>{conta.ativo ? "Ativa" : "Inativa"}</StatusBadge></td>
                <td className="actions">
                  <button type="button" className="btn-erp ghost xs" onClick={() => editar(conta)}>Editar</button>
                  {conta.ativo && <button type="button" className="danger-link" onClick={() => inativar(conta)}>Inativar</button>}
                </td>
              </tr>
            ))}
            {!contas.length && <tr><td colSpan={5}><div className="empty-st">Nenhuma conta cadastrada.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
