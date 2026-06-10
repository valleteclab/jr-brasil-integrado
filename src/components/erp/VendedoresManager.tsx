"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";

export type VendedorRow = {
  id: string;
  nome: string;
  email: string | null;
  percentualComissao: number;
  ativo: boolean;
};

/** Cadastro de vendedores e percentual de comissão. Criar/editar são ações de ADMIN. */
export function VendedoresManager({ vendedores, isAdmin }: { vendedores: VendedorRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [percentual, setPercentual] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function chamar(url: string, method: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível concluir a ação.");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const ok = await chamar("/api/erp/vendedores", "POST", {
      nome,
      email: email || null,
      percentualComissao: Number(percentual.replace(",", ".")) || 0
    });
    if (ok) {
      setNome("");
      setEmail("");
      setPercentual("");
    }
  }

  async function editarPercentual(v: VendedorRow) {
    const novo = window.prompt(`Percentual de comissão de ${v.nome} (%):`, String(v.percentualComissao));
    if (novo === null) return;
    await chamar(`/api/erp/vendedores/${v.id}`, "PATCH", { percentualComissao: Number(novo.replace(",", ".")) || 0 });
  }

  return (
    <>
      {error && <div className="alert danger"><span>{error}</span></div>}

      {isAdmin && (
        <div className="erp-card">
          <div className="erp-card-head"><h3>Novo vendedor</h3></div>
          <form className="erp-form" onSubmit={criar}>
            <label>
              <span>Nome <span aria-hidden="true">*</span></span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Nome do vendedor" />
            </label>
            <label>
              <span>E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" />
            </label>
            <label>
              <span>Comissão (%)</span>
              <input inputMode="decimal" value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="Ex.: 2,5" />
            </label>
            <div>
              <Button type="submit" variant="primary" disabled={busy}>{busy ? "Salvando..." : "Cadastrar"}</Button>
            </div>
          </form>
        </div>
      )}

      <div className="erp-card">
        <div className="erp-card-head"><h3>Vendedores ({vendedores.length})</h3></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>Nome</th><th>E-mail</th><th className="num">Comissão</th><th>Situação</th>{isAdmin && <th className="actions"></th>}</tr></thead>
            <tbody>
              {vendedores.map((v) => (
                <tr key={v.id}>
                  <td>{v.nome}</td>
                  <td>{v.email ?? "—"}</td>
                  <td className="num">{v.percentualComissao.toFixed(2).replace(".", ",")}%</td>
                  <td>{v.ativo ? "Ativo" : "Inativo"}</td>
                  {isAdmin && (
                    <td className="actions">
                      <button type="button" className="btn-erp light sm" onClick={() => editarPercentual(v)} disabled={busy}>% comissão</button>{" "}
                      <button
                        type="button"
                        className={`btn-erp ${v.ativo ? "danger" : "ghost"} sm`}
                        onClick={() => chamar(`/api/erp/vendedores/${v.id}`, "PATCH", { ativo: !v.ativo })}
                        disabled={busy}
                      >
                        {v.ativo ? "Inativar" : "Reativar"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {vendedores.length === 0 && <tr><td colSpan={isAdmin ? 5 : 4} className="block-muted">Nenhum vendedor cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
