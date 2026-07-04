"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import { correspondeBusca } from "@/lib/search/normalize";
import { usePaginado, Paginacao } from "@/components/shared/Paginacao";

type Tecnico = {
  id: string;
  nome: string;
  especialidade: string | null;
  telefone: string | null;
  custoHora: number;
  usuarioId: string | null;
  usuarioNome: string | null;
  ativo: boolean;
  osAbertas: number;
};

type UsuarioOpt = { id: string; nome: string; email: string };

type Props = { tecnicos: Tecnico[]; usuarios: UsuarioOpt[] };

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const vazio = { nome: "", especialidade: "", telefone: "", custoHora: "", usuarioId: "", ativo: true };

export function TecnicosManager({ tecnicos, usuarios }: Props) {
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(vazio);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"" | "ativos" | "inativos">("ativos");

  const filtrados = useMemo(
    () => tecnicos.filter((t) =>
      (statusFiltro === "" || (statusFiltro === "ativos" ? t.ativo : !t.ativo)) &&
      correspondeBusca(busca, t.nome, t.especialidade, t.telefone, t.usuarioNome)
    ),
    [tecnicos, busca, statusFiltro]
  );
  const { itensPagina, pagina, setPagina, totalPaginas, inicio, fim, total } = usePaginado(filtrados, 20);

  function abrirNovo() {
    setEditId(null);
    setForm(vazio);
    setErro("");
    setDrawer(true);
  }

  function abrirEdicao(t: Tecnico) {
    setEditId(t.id);
    setForm({
      nome: t.nome,
      especialidade: t.especialidade ?? "",
      telefone: t.telefone ?? "",
      custoHora: t.custoHora ? String(t.custoHora) : "",
      usuarioId: t.usuarioId ?? "",
      ativo: t.ativo
    });
    setErro("");
    setDrawer(true);
  }

  async function salvar() {
    setBusy(true);
    setErro("");
    try {
      const body = {
        nome: form.nome,
        especialidade: form.especialidade || null,
        telefone: form.telefone || null,
        custoHora: form.custoHora ? Number(form.custoHora.replace(",", ".")) : 0,
        usuarioId: form.usuarioId || null,
        ativo: form.ativo
      };
      const res = await fetch(editId ? `/api/erp/tecnicos/${editId}` : "/api/erp/tecnicos", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setDrawer(false);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function inativar(t: Tecnico) {
    if (!window.confirm(`Inativar o técnico "${t.nome}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/tecnicos/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Não foi possível inativar.");
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível inativar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="erp-toolbar">
        <div className="toolbar-search">
          <span className="ic-sr" aria-hidden="true">⌕</span>
          <input className="search" placeholder="Buscar por nome, especialidade, telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="btn-erp ghost sm" value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as "" | "ativos" | "inativos")}>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="">Todos</option>
        </select>
        <div className="grow" />
        <button type="button" className="btn-erp primary sm" onClick={abrirNovo}>+ Novo técnico</button>
      </div>

      {erro && !drawer && <div className="alert danger" style={{ marginTop: 12 }}><span>{erro}</span></div>}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Técnico</th>
              <th>Especialidade</th>
              <th>Login vinculado</th>
              <th className="num">Custo/hora</th>
              <th className="num">OS abertas</th>
              <th>Status</th>
              <th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {itensPagina.map((t) => (
              <tr key={t.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{t.nome}</div>
                  {t.telefone && <span className="sublabel">{t.telefone}</span>}
                </td>
                <td>{t.especialidade || "—"}</td>
                <td>{t.usuarioNome ? <span className="pill success" style={{ fontSize: 11 }}><span className="dot" />{t.usuarioNome}</span> : <span className="sublabel">sem login</span>}</td>
                <td className="num">{t.custoHora > 0 ? brl(t.custoHora) : "—"}</td>
                <td className="num">{t.osAbertas || "—"}</td>
                <td><span className={`pill ${t.ativo ? "success" : "mute"}`}><span className="dot" />{t.ativo ? "Ativo" : "Inativo"}</span></td>
                <td className="actions">
                  <button type="button" className="btn-erp ghost xs" onClick={() => abrirEdicao(t)}>Editar</button>
                  {t.ativo && <button type="button" className="btn-erp danger xs" onClick={() => inativar(t)}>Inativar</button>}
                </td>
              </tr>
            ))}
            {!total && (
              <tr><td colSpan={7}><div className="empty-st"><h4>{tecnicos.length ? "Nenhum técnico encontrado" : "Nenhum técnico cadastrado"}</h4><p>{tecnicos.length ? "Ajuste a busca ou o filtro de status." : "Cadastre a equipe da oficina para atribuir OS e registrar o que foi feito."}</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Paginacao pagina={pagina} totalPaginas={totalPaginas} onPagina={setPagina} inicio={inicio} fim={fim} total={total} rotuloItem="técnicos" />

      {drawer && (
        <>
          <div className="drawer-bd" onClick={() => setDrawer(false)} />
          <aside className="drawer">
            <div className="drawer-head">
              <div>
                <h2>{editId ? "Editar técnico" : "Novo técnico"}</h2>
                <p className="erp-page-sub">Vincule um login para o técnico atualizar as próprias OS.</p>
              </div>
              <button type="button" className="btn-erp ghost sm" onClick={() => setDrawer(false)}>Fechar</button>
            </div>
            <div className="drawer-body">
              {erro && <div className="alert danger" style={{ margin: "12px 16px 0" }}><span>{erro}</span></div>}
              <div className="erp-form">
                <label className="full">Nome<input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} /></label>
                <label>Especialidade<input placeholder="Ex.: Motor, elétrica, funilaria" value={form.especialidade} onChange={(e) => setForm((f) => ({ ...f, especialidade: e.target.value }))} /></label>
                <label>Telefone<input inputMode="numeric" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value.replace(/\D/g, "").slice(0, 13) }))} /></label>
                <label>Custo por hora (R$)<input inputMode="decimal" placeholder="Interno (opcional)" value={form.custoHora} onChange={(e) => setForm((f) => ({ ...f, custoHora: e.target.value }))} /></label>
                <label className="full">Login vinculado (para o técnico usar o sistema)
                  <select value={form.usuarioId} onChange={(e) => setForm((f) => ({ ...f, usuarioId: e.target.value }))}>
                    <option value="">— sem login —</option>
                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome} · {u.email}</option>)}
                  </select>
                  <small className="field-hint">Quando esse usuário abre uma OS, os apontamentos são atribuídos a este técnico automaticamente.</small>
                </label>
                <label className="check-row"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} /> Técnico ativo</label>
              </div>
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn-erp ghost sm" onClick={() => setDrawer(false)}>Cancelar</button>
              <Button type="button" onClick={salvar} disabled={busy}>{busy ? "Salvando…" : "Salvar técnico"}</Button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
