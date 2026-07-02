"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RecorrenciaResumo } from "@/domains/finance/application/recorrencia-use-cases";

/**
 * DESPESAS RECORRENTES (folha salarial, aluguel, energia, contador, assinaturas...):
 * cadastro do modelo e acompanhamento — as contas a pagar de cada competência são geradas
 * automaticamente (na criação e pelo cron), sem redigitar todo mês. Valor variável = o título
 * nasce como estimativa e o valor real é informado na baixa.
 */

type Opcao = { id: string; nome: string };
type ClassifOpcao = { id: string; nome: string; grupo: string; tipo: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const PERIODICIDADES = [
  { value: "MENSAL", label: "Mensal" },
  { value: "BIMESTRAL", label: "Bimestral" },
  { value: "TRIMESTRAL", label: "Trimestral" },
  { value: "SEMESTRAL", label: "Semestral" },
  { value: "ANUAL", label: "Anual (ex.: 13º, IPTU, seguro)" }
];

export function RecorrentesWorkspace({
  recorrencias,
  fornecedores,
  contas,
  classificacoes,
  formas
}: {
  recorrencias: RecorrenciaResumo[];
  fornecedores: Opcao[];
  contas: Opcao[];
  classificacoes: ClassifOpcao[];
  formas: Opcao[];
}) {
  const router = useRouter();
  const hoje = new Date();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState({
    descricao: "",
    fornecedorId: "",
    valor: "",
    valorVariavel: false,
    periodicidade: "MENSAL",
    diaVencimento: "5",
    dataInicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10),
    dataFim: "",
    formaPagamento: "",
    contaBancariaId: "",
    classificacaoId: "",
    observacoes: ""
  });

  const despesas = classificacoes.filter((c) => c.tipo === "DESPESA");
  const grupos = [...new Set(despesas.map((c) => c.grupo))];

  async function salvar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/erp/financeiro/recorrentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: form.descricao,
          fornecedorId: form.fornecedorId || null,
          valor: Number(form.valor) || 0,
          valorVariavel: form.valorVariavel,
          periodicidade: form.periodicidade,
          diaVencimento: Number(form.diaVencimento) || 0,
          dataInicio: form.dataInicio,
          dataFim: form.dataFim || null,
          formaPagamento: form.formaPagamento || null,
          contaBancariaId: form.contaBancariaId || null,
          classificacaoId: form.classificacaoId || null,
          observacoes: form.observacoes || null
        })
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível criar a despesa recorrente.");
      setOk("Despesa recorrente criada — as competências devidas já entraram no contas a pagar.");
      setShowForm(false);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao criar a despesa recorrente.");
    } finally {
      setBusy(false);
    }
  }

  async function mudarStatus(r: RecorrenciaResumo, status: "ATIVA" | "PAUSADA" | "ENCERRADA") {
    const avisos: Record<string, string> = {
      PAUSADA: `Pausar "${r.descricao}"? Novas competências deixam de ser geradas (as já lançadas ficam).`,
      ATIVA: `Reativar "${r.descricao}"? As competências devidas voltam a ser geradas.`,
      ENCERRADA: `Encerrar "${r.descricao}"? As parcelas EM ABERTO serão canceladas e nada mais será gerado.`
    };
    if (!window.confirm(avisos[status])) return;
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/financeiro/recorrentes/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível alterar a recorrência.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao alterar a recorrência.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="erp-toolbar">
        <div className="grow" />
        <button type="button" className="btn-erp primary sm" onClick={() => { setShowForm((v) => !v); setOk(""); }}>
          {showForm ? "Fechar formulário" : "+ Nova despesa recorrente"}
        </button>
      </div>

      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}
      {ok && <div className="alert success"><span className="lead">OK:</span><span>{ok}</span></div>}

      {showForm && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-head"><h3>Nova despesa recorrente</h3></div>
          <div className="erp-form">
            <label className="full">
              Descrição <span className="required">*</span>
              <input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} placeholder="Ex.: Folha salarial, Aluguel do galpão, Energia elétrica…" />
            </label>
            <label>
              Fornecedor/favorecido (opcional)
              <select value={form.fornecedorId} onChange={(e) => setForm((f) => ({ ...f, fornecedorId: e.target.value }))}>
                <option value="">— nenhum —</option>
                {fornecedores.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </label>
            <label>
              Valor {form.valorVariavel ? "(estimativa)" : ""} <span className="required">*</span>
              <input type="number" min="0.01" step="0.01" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22 }}>
              <input type="checkbox" checked={form.valorVariavel} onChange={(e) => setForm((f) => ({ ...f, valorVariavel: e.target.checked }))} style={{ width: "auto" }} />
              Valor variável (energia, folha) — ajusto o real na baixa
            </label>
            <label>
              Periodicidade
              <select value={form.periodicidade} onChange={(e) => setForm((f) => ({ ...f, periodicidade: e.target.value }))}>
                {PERIODICIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label>
              Dia do vencimento <span className="required">*</span>
              <input type="number" min="1" max="31" value={form.diaVencimento} onChange={(e) => setForm((f) => ({ ...f, diaVencimento: e.target.value }))} title="Dia do mês (31 vira o último dia em meses curtos)" />
            </label>
            <label>
              Primeira competência <span className="required">*</span>
              <input type="date" value={form.dataInicio} onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))} title="A partir de quando a despesa existe (competências passadas dentro do horizonte também são geradas)" />
            </label>
            <label>
              Fim (opcional)
              <input type="date" value={form.dataFim} onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))} title="Deixe vazio para prazo indeterminado" />
            </label>
            <label>
              Forma de pagamento
              <select value={form.formaPagamento} onChange={(e) => setForm((f) => ({ ...f, formaPagamento: e.target.value }))}>
                <option value="">— definir na baixa —</option>
                {formas.map((o) => <option key={o.id} value={o.nome}>{o.nome}</option>)}
              </select>
            </label>
            <label>
              Conta de débito padrão
              <select value={form.contaBancariaId} onChange={(e) => setForm((f) => ({ ...f, contaBancariaId: e.target.value }))}>
                <option value="">— escolher na baixa —</option>
                {contas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </label>
            <label>
              Classificação financeira (despesa)
              <select value={form.classificacaoId} onChange={(e) => setForm((f) => ({ ...f, classificacaoId: e.target.value }))}>
                <option value="">— sem classificação —</option>
                {grupos.map((g) => (
                  <optgroup key={g} label={g}>
                    {despesas.filter((c) => c.grupo === g).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="full">
              Observações
              <input value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "0 16px 16px" }}>
            <button type="button" className="btn-erp primary sm" disabled={busy} onClick={salvar}>
              {busy ? "Salvando…" : "Salvar e gerar competências"}
            </button>
          </div>
        </div>
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Despesa</th><th>Periodicidade</th><th className="num">Valor</th><th>Próximo vencimento</th>
              <th className="num">Pago no ano</th><th>Geradas/Pagas</th><th>Situação</th><th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {recorrencias.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.descricao}</strong>
                  <small className="block-muted">
                    {r.fornecedorNome ?? "sem fornecedor"} · {r.classificacaoNome ?? "sem classificação"} · desde {dataBr(r.dataInicio)}{r.dataFim ? ` até ${dataBr(r.dataFim)}` : ""}
                  </small>
                </td>
                <td>{PERIODICIDADES.find((p) => p.value === r.periodicidade)?.label ?? r.periodicidade}<small className="block-muted">dia {r.diaVencimento}</small></td>
                <td className="num">{brl(r.valor)}{r.valorVariavel && <small className="block-muted">variável (estimativa)</small>}</td>
                <td>{r.proximaOcorrencia ? `${dataBr(r.proximaOcorrencia.vencimento)} · ${brl(r.proximaOcorrencia.valor)}` : "—"}</td>
                <td className="num">{brl(r.totalPagoAno)}</td>
                <td>{r.ocorrenciasGeradas} / {r.ocorrenciasPagas} pagas</td>
                <td>
                  <span className={`pill ${r.status === "ATIVA" ? "success" : r.status === "PAUSADA" ? "warn" : "mute"}`}>
                    <span className="dot" />{r.status.toLowerCase()}
                  </span>
                </td>
                <td className="actions">
                  {r.status === "ATIVA" && (
                    <button type="button" className="btn-erp ghost xs" disabled={busy} onClick={() => mudarStatus(r, "PAUSADA")}>Pausar</button>
                  )}
                  {r.status === "PAUSADA" && (
                    <button type="button" className="btn-erp ghost xs" disabled={busy} onClick={() => mudarStatus(r, "ATIVA")}>Reativar</button>
                  )}
                  {r.status !== "ENCERRADA" && (
                    <button type="button" className="btn-erp danger xs" disabled={busy} onClick={() => mudarStatus(r, "ENCERRADA")}>Encerrar</button>
                  )}
                </td>
              </tr>
            ))}
            {!recorrencias.length && (
              <tr><td colSpan={8}><div className="empty-st"><h4>Nenhuma despesa recorrente</h4><p>Cadastre folha salarial, aluguel, energia… e as contas a pagar de cada mês serão geradas sozinhas.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
