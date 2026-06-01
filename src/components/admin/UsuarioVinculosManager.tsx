"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { StatusBadge } from "@/components/shared/StatusBadge";

type VinculoRow = {
  id: string;
  clienteId: string;
  clienteNome: string;
  empresaId: string | null;
  empresaNome: string | null;
  perfilId: string;
  perfilNome: string;
  ativo: boolean;
};
type EstruturaCliente = { id: string; nome: string; empresas: { id: string; nome: string }[]; perfis: { id: string; nome: string }[] };

type Props = { usuarioId: string; vinculos: VinculoRow[]; estrutura: EstruturaCliente[] };

export function UsuarioVinculosManager({ usuarioId, vinculos, estrutura }: Props) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Formulário de novo vínculo.
  const [tenantId, setTenantId] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [perfilId, setPerfilId] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const clienteSel = useMemo(() => estrutura.find((c) => c.id === tenantId), [estrutura, tenantId]);

  async function chamar(acao: () => Promise<Response>, id: string) {
    setBusyId(id);
    setErro("");
    try {
      const res = await acao();
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Operação não concluída.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Operação não concluída.");
    } finally {
      setBusyId(null);
    }
  }

  function alterarPerfil(vinculoId: string, novoPerfilId: string) {
    return chamar(
      () =>
        fetch(`/api/admin/vinculos/${vinculoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ perfilId: novoPerfilId })
        }),
      vinculoId
    );
  }

  function alternarAtivo(v: VinculoRow) {
    return chamar(
      () =>
        fetch(`/api/admin/vinculos/${v.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ativo: !v.ativo })
        }),
      v.id
    );
  }

  function remover(vinculoId: string) {
    if (!window.confirm("Remover este vínculo? O usuário perderá o acesso a esse cliente/empresa.")) return;
    return chamar(() => fetch(`/api/admin/vinculos/${vinculoId}`, { method: "DELETE" }), vinculoId);
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setAddBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin/usuarios/${usuarioId}/vinculos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, empresaId, perfilId })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível adicionar o vínculo.");
      setTenantId("");
      setEmpresaId("");
      setPerfilId("");
      router.refresh();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível adicionar o vínculo.");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <>
      {erro && <div className="alert danger" style={{ marginBottom: 12 }}><span>{erro}</span></div>}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Empresa</th>
              <th>Perfil</th>
              <th>Situação</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {vinculos.length === 0 && (
              <tr><td colSpan={5}>Nenhum vínculo. Adicione abaixo.</td></tr>
            )}
            {vinculos.map((v) => {
              const perfisDoCliente = estrutura.find((c) => c.id === v.clienteId)?.perfis ?? [];
              const ocupado = busyId === v.id;
              return (
                <tr key={v.id}>
                  <td><strong>{v.clienteNome}</strong></td>
                  <td>{v.empresaNome ?? "—"}</td>
                  <td>
                    <select
                      value={v.perfilId}
                      disabled={ocupado || perfisDoCliente.length === 0}
                      onChange={(e) => alterarPerfil(v.id, e.target.value)}
                    >
                      {perfisDoCliente.length === 0 && <option value={v.perfilId}>{v.perfilNome}</option>}
                      {perfisDoCliente.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                  </td>
                  <td><StatusBadge tone={v.ativo ? "success" : "mute"}>{v.ativo ? "Ativo" : "Inativo"}</StatusBadge></td>
                  <td className="actions">
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn-erp ghost sm" disabled={ocupado} onClick={() => alternarAtivo(v)}>
                        {v.ativo ? "Desativar" : "Ativar"}
                      </button>
                      <button type="button" className="btn-erp ghost sm" disabled={ocupado} onClick={() => remover(v.id)}>
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={adicionar} style={{ marginTop: 16 }}>
        <h4 style={{ margin: "0 0 8px" }}>Adicionar vínculo</h4>
        <div className="form-grid two">
          <label>
            Cliente
            <select
              value={tenantId}
              required
              onChange={(e) => {
                setTenantId(e.target.value);
                setEmpresaId("");
                setPerfilId("");
              }}
            >
              <option value="">Selecione…</option>
              {estrutura.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>
          <label>
            Empresa
            <select value={empresaId} required disabled={!clienteSel} onChange={(e) => setEmpresaId(e.target.value)}>
              <option value="">Selecione…</option>
              {clienteSel?.empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nome}</option>
              ))}
            </select>
          </label>
          <label>
            Perfil
            <select value={perfilId} required disabled={!clienteSel} onChange={(e) => setPerfilId(e.target.value)}>
              <option value="">Selecione…</option>
              {clienteSel?.perfis.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="erp-page-actions" style={{ marginTop: 12 }}>
          <Button type="submit" disabled={addBusy}>{addBusy ? "Adicionando…" : "Adicionar vínculo"}</Button>
        </div>
      </form>
    </>
  );
}
