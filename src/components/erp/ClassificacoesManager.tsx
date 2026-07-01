"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClassificacaoResumo } from "@/domains/finance/application/classificacao-use-cases";

type Props = {
  initial: ClassificacaoResumo[];
  gruposSugeridos: string[];
};

/**
 * Gestão do plano de classificações financeiras: criar/editar/excluir classificações, definir a
 * meta mensal (IDEAL) inline e criar o plano padrão com um clique. O plano alimenta a coluna
 * "Classificação" do financeiro e o relatório Fechamento mensal.
 */
export function ClassificacoesManager({ initial, gruposSugeridos }: Props) {
  const router = useRouter();
  const [itens, setItens] = useState(initial);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // Form de nova classificação
  const [nome, setNome] = useState("");
  const [grupo, setGrupo] = useState(gruposSugeridos[0] ?? "");
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<"DESPESA" | "RECEITA">("DESPESA");
  const [orcamento, setOrcamento] = useState("");
  // Edição inline do orçamento (id → valor em edição)
  const [editandoOrcamento, setEditandoOrcamento] = useState<Record<string, string>>({});

  const grupos = useMemo(() => {
    const set = new Set<string>([...itens.map((c) => c.grupo)]);
    return [...set].sort((a, b) => {
      const ia = gruposSugeridos.indexOf(a);
      const ib = gruposSugeridos.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b, "pt-BR");
    });
  }, [itens, gruposSugeridos]);

  async function recarregar() {
    const res = await fetch("/api/erp/financeiro/classificacoes");
    const data = (await res.json()) as { classificacoes?: ClassificacaoResumo[] };
    if (data.classificacoes) setItens(data.classificacoes);
  }

  async function criarPlanoPadrao() {
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/erp/financeiro/classificacoes/seed", { method: "POST" });
      const data = (await res.json()) as { criadas?: number; contasClassificadas?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível criar o plano padrão.");
      await recarregar();
      const partes = [
        data.criadas ? `${data.criadas} classificação(ões) criadas` : "plano já estava completo",
        data.contasClassificadas ? `${data.contasClassificadas} conta(s) existentes classificadas automaticamente` : null
      ].filter(Boolean);
      setAviso(`${partes.join("; ")}. Ajuste nomes/metas como preferir.`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao criar o plano padrão.");
    } finally {
      setBusy(false);
    }
  }

  /** Backfill: classifica as contas antigas sem classificação (entrada fiscal/fornecedor/vendas). */
  async function classificarExistentes() {
    setBusy(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/erp/financeiro/classificacoes/backfill", { method: "POST" });
      const data = (await res.json()) as { pagar?: number; receber?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível classificar as contas.");
      const total = (data.pagar ?? 0) + (data.receber ?? 0);
      setAviso(
        total
          ? `${total} conta(s) classificadas automaticamente (${data.pagar ?? 0} a pagar, ${data.receber ?? 0} a receber).`
          : "Nenhuma conta pôde ser classificada automaticamente — as restantes precisam de classificação manual."
      );
      await recarregar();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao classificar as contas.");
    } finally {
      setBusy(false);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/erp/financeiro/classificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          grupo,
          codigo: codigo || undefined,
          tipo,
          orcamentoMensal: orcamento ? parseFloat(orcamento) : undefined
        })
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível criar a classificação.");
      setNome("");
      setCodigo("");
      setOrcamento("");
      setShowForm(false);
      await recarregar();
      router.refresh();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Falha ao criar classificação.");
    } finally {
      setBusy(false);
    }
  }

  async function salvarOrcamento(id: string) {
    const valorStr = editandoOrcamento[id];
    if (valorStr === undefined) return;
    const valor = parseFloat(valorStr.replace(",", ".")) || 0;
    setErro("");
    try {
      const res = await fetch(`/api/erp/financeiro/classificacoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orcamentoMensal: valor })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar a meta.");
      setItens((prev) => prev.map((c) => (c.id === id ? { ...c, orcamentoMensal: valor } : c)));
      setEditandoOrcamento((prev) => {
        const { [id]: _removido, ...resto } = prev;
        return resto;
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar a meta.");
    }
  }

  async function alternarAtivo(c: ClassificacaoResumo) {
    setErro("");
    try {
      const res = await fetch(`/api/erp/financeiro/classificacoes/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !c.ativo })
      });
      if (!res.ok) throw new Error("Não foi possível atualizar.");
      setItens((prev) => prev.map((x) => (x.id === c.id ? { ...x, ativo: !c.ativo } : x)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar.");
    }
  }

  async function excluir(c: ClassificacaoResumo) {
    const msg = c.contasVinculadas > 0
      ? `"${c.nome}" tem ${c.contasVinculadas} conta(s) vinculada(s) e será apenas DESATIVADA. Continuar?`
      : `Excluir a classificação "${c.nome}"?`;
    if (!window.confirm(msg)) return;
    setErro("");
    try {
      const res = await fetch(`/api/erp/financeiro/classificacoes/${c.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { excluida?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível excluir.");
      if (data.excluida) setItens((prev) => prev.filter((x) => x.id !== c.id));
      else setItens((prev) => prev.map((x) => (x.id === c.id ? { ...x, ativo: false } : x)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao excluir.");
    }
  }

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <>
      <div className="erp-toolbar">
        <span style={{ fontSize: 13, color: "var(--erp-slate)" }}>
          {itens.length
            ? `${itens.filter((c) => c.ativo).length} classificação(ões) ativas em ${grupos.length} grupo(s).`
            : "Nenhuma classificação cadastrada ainda."}
        </span>
        <div className="grow" />
        <button type="button" className="btn-erp ghost sm" onClick={criarPlanoPadrao} disabled={busy}>
          {busy ? "Processando…" : itens.length ? "Completar plano padrão" : "Criar plano padrão"}
        </button>
        {itens.length > 0 && (
          <button
            type="button"
            className="btn-erp ghost sm"
            title="Classifica as contas antigas sem classificação: entrada fiscal pela finalidade, demais pela memória do fornecedor, recebíveis de venda/OS pelas receitas padrão."
            onClick={classificarExistentes}
            disabled={busy}
          >
            {busy ? "Processando…" : "Classificar contas existentes"}
          </button>
        )}
        <button type="button" className="btn-erp primary sm" onClick={() => setShowForm((v) => !v)}>
          + Nova classificação
        </button>
      </div>

      {erro && (
        <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>
      )}
      {aviso && (
        <div className="alert success"><span className="lead">OK:</span><span>{aviso}</span></div>
      )}

      {showForm && (
        <form onSubmit={criar} className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="erp-form" style={{ padding: 0 }}>
            <label>
              Nome <span className="required">*</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Energia elétrica" required />
            </label>
            <label>
              Grupo <span className="required">*</span>
              <input value={grupo} onChange={(e) => setGrupo(e.target.value)} list="grupos-sugeridos" required />
              <datalist id="grupos-sugeridos">
                {grupos.concat(gruposSugeridos.filter((g) => !grupos.includes(g))).map((g) => <option key={g} value={g} />)}
              </datalist>
            </label>
            <label>
              Código (opcional)
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: 02.02.01.14" />
            </label>
            <label>
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value as "DESPESA" | "RECEITA")}>
                <option value="DESPESA">Despesa (contas a pagar)</option>
                <option value="RECEITA">Receita (contas a receber)</option>
              </select>
            </label>
            <label>
              Meta mensal / IDEAL (R$)
              <input type="number" step="0.01" min="0" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} placeholder="0,00" />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn-erp ghost sm" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn-erp primary sm" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
          </div>
        </form>
      )}

      {grupos.map((g) => {
        const doGrupo = itens.filter((c) => c.grupo === g);
        const totalMeta = doGrupo.filter((c) => c.ativo).reduce((s, c) => s + c.orcamentoMensal, 0);
        return (
          <div key={g} className="erp-table-wrap" style={{ marginBottom: 16 }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th colSpan={2} style={{ fontSize: 13 }}>{g}</th>
                  <th className="num" style={{ fontSize: 12 }}>Meta do grupo: {fmt(totalMeta)}</th>
                  <th>Contas</th>
                  <th>Situação</th>
                  <th className="actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {doGrupo.map((c) => (
                  <tr key={c.id} style={c.ativo ? undefined : { opacity: 0.5 }}>
                    <td style={{ width: 120 }}><span className="mono">{c.codigo ?? "—"}</span></td>
                    <td>
                      <strong>{c.nome}</strong>
                      {c.tipo === "RECEITA" && <span className="sublabel">Receita</span>}
                    </td>
                    <td className="num" style={{ width: 210 }}>
                      {editandoOrcamento[c.id] !== undefined ? (
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            autoFocus
                            value={editandoOrcamento[c.id]}
                            onChange={(e) => setEditandoOrcamento((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarOrcamento(c.id); } }}
                            style={{ width: 110, padding: "4px 6px", border: "1px solid var(--erp-line)", borderRadius: 6 }}
                          />
                          <button type="button" className="btn-erp primary xs" onClick={() => salvarOrcamento(c.id)}>OK</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn-erp ghost xs"
                          title="Editar a meta mensal (IDEAL)"
                          onClick={() => setEditandoOrcamento((prev) => ({ ...prev, [c.id]: String(c.orcamentoMensal || "") }))}
                        >
                          {c.orcamentoMensal > 0 ? fmt(c.orcamentoMensal) : "definir meta"}
                        </button>
                      )}
                    </td>
                    <td>{c.contasVinculadas}</td>
                    <td>
                      <span className={`pill ${c.ativo ? "success" : "mute"}`}>
                        <span className="dot" />
                        {c.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="actions">
                      <button type="button" className="btn-erp ghost xs" onClick={() => alternarAtivo(c)}>
                        {c.ativo ? "Desativar" : "Reativar"}
                      </button>
                      <button type="button" className="btn-erp danger xs" onClick={() => excluir(c)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {!itens.length && (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <h3 style={{ marginTop: 0 }}>Comece pelo plano padrão</h3>
          <p style={{ color: "var(--erp-slate)" }}>
            Criamos um plano inicial com os grupos e classificações típicos (mercadoria para revenda,
            salários, combustível, empréstimos…). Depois é só ajustar nomes, códigos e metas mensais.
          </p>
          <button type="button" className="btn-erp primary sm" onClick={criarPlanoPadrao} disabled={busy}>
            {busy ? "Criando…" : "Criar plano padrão"}
          </button>
        </div>
      )}
    </>
  );
}
