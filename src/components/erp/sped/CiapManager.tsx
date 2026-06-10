"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { CiapBemView } from "@/domains/fiscal/application/sped-use-cases";

type Props = { bens: CiapBemView[] };

const formatBrl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Gestão dos bens do CIAP (bloco G do SPED): ativo imobilizado com crédito de ICMS
 * apropriado em até 48 parcelas mensais × fator de saídas tributadas.
 */
export function CiapManager({ bens }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [form, setForm] = useState({ descricao: "", valorIcms: "", imobilizadoEm: "", docNumero: "", fornecedorNome: "" });

  async function criar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/erp/sped-fiscal/ciap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: form.descricao,
          valorIcms: Number(form.valorIcms.replace(/\./g, "").replace(",", ".")),
          imobilizadoEm: form.imobilizadoEm,
          docNumero: form.docNumero || undefined,
          fornecedorNome: form.fornecedorNome || undefined
        })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cadastrar o bem.");
      setNovoAberto(false);
      setForm({ descricao: "", valorIcms: "", imobilizadoEm: "", docNumero: "", fornecedorNome: "" });
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível cadastrar o bem.");
    } finally {
      setBusy(false);
    }
  }

  async function baixar(bem: CiapBemView) {
    if (!window.confirm(`Baixar o bem "${bem.descricao}"? A apropriação das parcelas para a partir de agora (ajuste da baixa no G125 com o contador).`)) return;
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/sped-fiscal/ciap/${bem.id}`, { method: "PUT" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível baixar o bem.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível baixar o bem.");
    } finally {
      setBusy(false);
    }
  }

  async function excluir(bem: CiapBemView) {
    if (!window.confirm(`Excluir o bem "${bem.descricao}" do CIAP? Ele deixa de aparecer no bloco G.`)) return;
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/sped-fiscal/ciap/${bem.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir o bem.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir o bem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="button primary sm" onClick={() => setNovoAberto((v) => !v)}>
          {novoAberto ? "Cancelar" : "+ Cadastrar bem manualmente"}
        </button>
      </div>

      {novoAberto && (
        <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            <label className="field" style={{ gridColumn: "span 2" }}>
              <span>Descrição do bem*</span>
              <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} disabled={busy} />
            </label>
            <label className="field">
              <span>ICMS passível de crédito (R$)*</span>
              <input value={form.valorIcms} onChange={(e) => setForm({ ...form, valorIcms: e.target.value })} placeholder="0,00" disabled={busy} />
            </label>
            <label className="field">
              <span>Imobilizado em*</span>
              <input type="date" value={form.imobilizadoEm} onChange={(e) => setForm({ ...form, imobilizadoEm: e.target.value })} disabled={busy} />
            </label>
            <label className="field">
              <span>Nº da nota (opcional)</span>
              <input value={form.docNumero} onChange={(e) => setForm({ ...form, docNumero: e.target.value })} disabled={busy} />
            </label>
            <label className="field">
              <span>Fornecedor (opcional)</span>
              <input value={form.fornecedorNome} onChange={(e) => setForm({ ...form, fornecedorNome: e.target.value })} disabled={busy} />
            </label>
          </div>
          <div>
            <button type="button" className="button primary" onClick={criar} disabled={busy}>
              {busy ? "Salvando…" : "Cadastrar bem (48 parcelas)"}
            </button>
          </div>
        </div>
      )}

      {erro && (
        <div className="system-error">
          <strong>Não foi possível concluir</strong>
          <span>{erro}</span>
        </div>
      )}

      {bens.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--jr-slate)" }}>
          Nenhum bem no CIAP. Bens entram automaticamente ao processar uma nota de entrada com
          finalidade <strong>Imobilizado</strong> (com ICMS destacado ou crédito do Simples), ou cadastre manualmente.
        </div>
      ) : (
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Bem</th>
                <th>Origem</th>
                <th style={{ textAlign: "right" }}>Crédito total</th>
                <th style={{ textAlign: "right" }}>Parcela mensal</th>
                <th>Andamento</th>
                <th>Imobilizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {bens.map((bem) => (
                <tr key={bem.id}>
                  <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{bem.codigo}</td>
                  <td>{bem.descricao}</td>
                  <td>{bem.fornecedorNome ? `${bem.fornecedorNome}${bem.docNumero ? ` · NF ${bem.docNumero}` : ""}` : bem.docNumero ? `NF ${bem.docNumero}` : "—"}</td>
                  <td style={{ textAlign: "right" }}>{formatBrl(bem.valorCredito)}</td>
                  <td style={{ textAlign: "right" }}>{formatBrl(bem.valorParcela)}</td>
                  <td>
                    <StatusBadge tone={bem.parcelaAtual === "baixado" ? "danger" : bem.parcelaAtual === "concluído" ? "mute" : "info"}>
                      {bem.parcelaAtual}
                    </StatusBadge>
                  </td>
                  <td>{new Date(bem.imobilizadoEm).toLocaleDateString("pt-BR")}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!bem.baixadoEm && (
                        <button type="button" className="button light sm" onClick={() => baixar(bem)} disabled={busy}>
                          Baixar
                        </button>
                      )}
                      <button type="button" className="button danger sm" onClick={() => excluir(bem)} disabled={busy}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
