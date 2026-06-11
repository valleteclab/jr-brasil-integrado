"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";

type Maquina = {
  id: string;
  nome: string;
  adquirente: string | null;
  contaBancariaId: string | null;
  taxaDebito: number;
  taxaCredito: number;
  taxaCreditoParcelado: number;
  prazoDebitoDias: number;
  prazoCreditoDias: number;
  ativo: boolean;
};
type Conta = { id: string; nome: string };

const VAZIO = {
  nome: "",
  adquirente: "",
  contaBancariaId: "",
  taxaDebito: "0",
  taxaCredito: "0",
  taxaCreditoParcelado: "0",
  prazoDebitoDias: "1",
  prazoCreditoDias: "30"
};

const pct = (v: number) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function MaquinasCartaoManager({ initial, contas }: { initial: Maquina[]; contas: Conta[] }) {
  const [maquinas, setMaquinas] = useState(initial);
  const [form, setForm] = useState({ ...VAZIO });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const contaNome = (id: string | null) => contas.find((c) => c.id === id)?.nome ?? null;

  function reset() {
    setForm({ ...VAZIO });
    setEditingId(null);
  }

  function editar(maquina: Maquina) {
    setEditingId(maquina.id);
    setForm({
      nome: maquina.nome,
      adquirente: maquina.adquirente ?? "",
      contaBancariaId: maquina.contaBancariaId ?? "",
      taxaDebito: String(maquina.taxaDebito),
      taxaCredito: String(maquina.taxaCredito),
      taxaCreditoParcelado: String(maquina.taxaCreditoParcelado),
      prazoDebitoDias: String(maquina.prazoDebitoDias),
      prazoCreditoDias: String(maquina.prazoCreditoDias)
    });
    setMessage("");
    setError("");
  }

  async function recarregar() {
    const data = await fetch("/api/erp/configuracoes/maquinas-cartao").then((r) => r.json()).catch(() => null) as { maquinas?: Maquina[] } | null;
    if (data?.maquinas) {
      setMaquinas(data.maquinas.map((m) => ({
        ...m,
        taxaDebito: Number(m.taxaDebito),
        taxaCredito: Number(m.taxaCredito),
        taxaCreditoParcelado: Number(m.taxaCreditoParcelado)
      })));
    }
  }

  async function salvar() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        nome: form.nome,
        adquirente: form.adquirente || null,
        contaBancariaId: form.contaBancariaId || null,
        taxaDebito: Number(form.taxaDebito.replace(",", ".")) || 0,
        taxaCredito: Number(form.taxaCredito.replace(",", ".")) || 0,
        taxaCreditoParcelado: Number(form.taxaCreditoParcelado.replace(",", ".")) || 0,
        prazoDebitoDias: Number(form.prazoDebitoDias) || 0,
        prazoCreditoDias: Number(form.prazoCreditoDias) || 0
      };
      const url = editingId ? `/api/erp/configuracoes/maquinas-cartao/${editingId}` : "/api/erp/configuracoes/maquinas-cartao";
      const response = await fetch(url, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar a máquina de cartão.");
      await recarregar();
      reset();
      setMessage("Máquina de cartão salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a máquina de cartão.");
    } finally {
      setSaving(false);
    }
  }

  async function inativar(maquina: Maquina) {
    if (!window.confirm(`Inativar a máquina "${maquina.nome}"?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/erp/configuracoes/maquinas-cartao/${maquina.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "Falha ao inativar.");
      await recarregar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível inativar a máquina.");
    }
  }

  return (
    <section className="erp-card">
      <div className="erp-card-head">
        <div>
          <h3>{editingId ? "Editar máquina" : "Nova máquina de cartão"}</h3>
          <span>Maquininha de cartão com suas taxas e prazos de liquidação.</span>
        </div>
        {editingId && <button type="button" className="btn-erp ghost xs" onClick={reset}>Cancelar edição</button>}
      </div>

      <div className="erp-form">
        <label>
          Nome *
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Cielo loja, Stone PDV" />
        </label>
        <label>
          Adquirente
          <input value={form.adquirente} onChange={(e) => setForm({ ...form, adquirente: e.target.value })} placeholder="Ex: Cielo, Stone, PagSeguro" />
        </label>
        <label>
          Conta de liquidação (opcional)
          <select value={form.contaBancariaId} onChange={(e) => setForm({ ...form, contaBancariaId: e.target.value })}>
            <option value="">— Nenhuma —</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label>Taxa débito (%)<input value={form.taxaDebito} onChange={(e) => setForm({ ...form, taxaDebito: e.target.value })} /></label>
        <label>Taxa crédito (%)<input value={form.taxaCredito} onChange={(e) => setForm({ ...form, taxaCredito: e.target.value })} /></label>
        <label>Taxa crédito parcelado (%)<input value={form.taxaCreditoParcelado} onChange={(e) => setForm({ ...form, taxaCreditoParcelado: e.target.value })} /></label>
        <label>Prazo débito (dias)<input value={form.prazoDebitoDias} onChange={(e) => setForm({ ...form, prazoDebitoDias: e.target.value.replace(/\D/g, "") })} /></label>
        <label>Prazo crédito (dias)<input value={form.prazoCreditoDias} onChange={(e) => setForm({ ...form, prazoCreditoDias: e.target.value.replace(/\D/g, "") })} /></label>
      </div>

      {message && <div className="alert info" style={{ margin: "0 16px 12px" }}><strong>OK</strong><span>{message}</span></div>}
      {error && <div className="alert danger" style={{ margin: "0 16px 12px" }}><strong>Atenção</strong><span>{error}</span></div>}

      <footer className="inline-foot">
        <Button type="button" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar máquina"}</Button>
      </footer>

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr><th>Nome</th><th>Adquirente</th><th>Conta</th><th>Taxas (D/C/CP)</th><th>Prazos (D/C)</th><th>Situação</th><th className="actions">Ações</th></tr>
          </thead>
          <tbody>
            {maquinas.map((maquina) => (
              <tr key={maquina.id} style={maquina.ativo ? undefined : { opacity: 0.55 }}>
                <td><strong>{maquina.nome}</strong></td>
                <td>{maquina.adquirente ?? "-"}</td>
                <td>{contaNome(maquina.contaBancariaId) ?? "-"}</td>
                <td>{pct(maquina.taxaDebito)} / {pct(maquina.taxaCredito)} / {pct(maquina.taxaCreditoParcelado)}</td>
                <td>{maquina.prazoDebitoDias}d / {maquina.prazoCreditoDias}d</td>
                <td><StatusBadge tone={maquina.ativo ? "success" : "mute"}>{maquina.ativo ? "Ativa" : "Inativa"}</StatusBadge></td>
                <td className="actions">
                  <button type="button" className="btn-erp ghost xs" onClick={() => editar(maquina)}>Editar</button>
                  {maquina.ativo && <button type="button" className="danger-link" onClick={() => inativar(maquina)}>Inativar</button>}
                </td>
              </tr>
            ))}
            {!maquinas.length && <tr><td colSpan={7}><div className="empty-st">Nenhuma máquina cadastrada.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
