"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmprestimoResumo } from "@/domains/finance/application/emprestimo-use-cases";

/**
 * CONTRATOS DE EMPRÉSTIMO/FINANCIAMENTO — cadastro com simulação do cronograma (PRICE/SAC/carnê),
 * suporte a contrato antigo (parcelas já pagas) e acompanhamento: saldo devedor, progresso e
 * cronograma parcela a parcela (juros × amortização). As parcelas em aberto viram contas a pagar.
 */

type Opcao = { id: string; nome: string };
type ClassifOpcao = { id: string; nome: string; grupo: string; tipo: string };

type LinhaSimulacao = {
  numero: number;
  vencimento: string;
  valor: number;
  juros: number;
  amortizacao: number;
  saldoDevedorApos: number;
  jaPaga?: boolean;
  situacao?: string;
  pagoEm?: string | null;
};

type Simulacao = {
  cronograma: LinhaSimulacao[];
  resumo: { totalPagar: number; totalJuros: number; saldoDevedorAtual: number; parcelasRestantes: number };
};

type Detalhe = EmprestimoResumo & {
  observacoes: string | null;
  contaBancariaNome: string | null;
  classificacaoNome: string | null;
  cronograma: LinhaSimulacao[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const SISTEMAS = [
  { value: "PRICE", label: "PRICE — parcelas iguais (mais comum em bancos)" },
  { value: "SAC", label: "SAC — amortização constante (parcelas decrescentes)" },
  { value: "PARCELA_INFORMADA", label: "Parcela do contrato/carnê (informo o valor)" },
  { value: "SEM_JUROS", label: "Sem juros — divide o principal igualmente" }
];
const TIPOS = [
  { value: "EMPRESTIMO", label: "Empréstimo" },
  { value: "FINANCIAMENTO", label: "Financiamento" },
  { value: "CONSIGNADO", label: "Consignado" },
  { value: "OUTRO", label: "Outro" }
];

export function EmprestimosWorkspace({
  emprestimos,
  fornecedores,
  contas,
  classificacoes
}: {
  emprestimos: EmprestimoResumo[];
  fornecedores: Opcao[];
  contas: Opcao[];
  classificacoes: ClassifOpcao[];
}) {
  const router = useRouter();
  const hojeIso = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [sim, setSim] = useState<Simulacao | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [form, setForm] = useState({
    tipo: "EMPRESTIMO",
    instituicao: "",
    fornecedorId: "",
    numeroContrato: "",
    dataContratacao: hojeIso,
    valorPrincipal: "",
    taxaJurosMensal: "",
    sistemaAmortizacao: "PRICE",
    totalParcelas: "12",
    parcelasJaPagas: "0",
    valorParcela: "",
    primeiroVencimento: hojeIso,
    contaBancariaId: "",
    classificacaoId: "",
    observacoes: ""
  });

  const despesas = classificacoes.filter((c) => c.tipo === "DESPESA");
  const grupos = [...new Set(despesas.map((c) => c.grupo))];

  function payloadForm() {
    return {
      tipo: form.tipo,
      instituicao: form.instituicao,
      fornecedorId: form.fornecedorId || null,
      numeroContrato: form.numeroContrato || null,
      dataContratacao: form.dataContratacao,
      valorPrincipal: Number(form.valorPrincipal) || 0,
      taxaJurosMensal: Number(form.taxaJurosMensal) || 0,
      sistemaAmortizacao: form.sistemaAmortizacao,
      totalParcelas: Number(form.totalParcelas) || 0,
      parcelasJaPagas: Number(form.parcelasJaPagas) || 0,
      valorParcela: Number(form.valorParcela) || null,
      primeiroVencimento: form.primeiroVencimento,
      contaBancariaId: form.contaBancariaId || null,
      classificacaoId: form.classificacaoId || null,
      observacoes: form.observacoes || null
    };
  }

  async function simular() {
    setBusy(true);
    setErro("");
    setSim(null);
    try {
      const res = await fetch("/api/erp/financeiro/emprestimos/simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadForm())
      });
      const data = (await res.json().catch(() => ({}))) as Simulacao & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível simular.");
      setSim(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao simular o cronograma.");
    } finally {
      setBusy(false);
    }
  }

  async function salvar() {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch("/api/erp/financeiro/emprestimos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadForm())
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cadastrar o empréstimo.");
      setOk("Contrato cadastrado — as parcelas em aberto já estão no contas a pagar.");
      setShowForm(false);
      setSim(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao cadastrar o empréstimo.");
    } finally {
      setBusy(false);
    }
  }

  async function abrirDetalhe(id: string) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/financeiro/emprestimos/${id}`);
      const data = (await res.json().catch(() => ({}))) as Detalhe & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível carregar o contrato.");
      setDetalhe(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o contrato.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelar(e: EmprestimoResumo) {
    if (!window.confirm(`Cancelar o contrato de ${e.instituicao}? As parcelas em aberto serão canceladas no contas a pagar (as pagas ficam no histórico).`)) return;
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/financeiro/emprestimos/${e.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível cancelar o contrato.");
      setDetalhe(null);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao cancelar o contrato.");
    } finally {
      setBusy(false);
    }
  }

  const ehParcelaInformada = form.sistemaAmortizacao === "PARCELA_INFORMADA";

  return (
    <section>
      <div className="erp-toolbar">
        <div className="grow" />
        <button type="button" className="btn-erp primary sm" onClick={() => { setShowForm((v) => !v); setOk(""); }}>
          {showForm ? "Fechar formulário" : "+ Novo empréstimo/financiamento"}
        </button>
      </div>

      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}
      {ok && <div className="alert success"><span className="lead">OK:</span><span>{ok}</span></div>}

      {showForm && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-head"><h3>Novo contrato</h3></div>
          <div className="erp-form">
            <label>
              Tipo
              <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>
              Instituição / credor <span className="required">*</span>
              <input value={form.instituicao} onChange={(e) => setForm((f) => ({ ...f, instituicao: e.target.value }))} placeholder="Ex.: Sicoob, Caixa, BNDES…" />
            </label>
            <label>
              Fornecedor vinculado (opcional)
              <select value={form.fornecedorId} onChange={(e) => setForm((f) => ({ ...f, fornecedorId: e.target.value }))}>
                <option value="">— nenhum —</option>
                {fornecedores.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </label>
            <label>
              Nº do contrato
              <input value={form.numeroContrato} onChange={(e) => setForm((f) => ({ ...f, numeroContrato: e.target.value }))} />
            </label>
            <label>
              Data de contratação <span className="required">*</span>
              <input type="date" value={form.dataContratacao} onChange={(e) => setForm((f) => ({ ...f, dataContratacao: e.target.value }))} />
            </label>
            <label>
              Valor do principal (liberado) <span className="required">*</span>
              <input type="number" min="0.01" step="0.01" value={form.valorPrincipal} onChange={(e) => setForm((f) => ({ ...f, valorPrincipal: e.target.value }))} />
            </label>
            <label>
              Taxa de juros (% ao mês)
              <input type="number" min="0" step="0.0001" value={form.taxaJurosMensal} onChange={(e) => setForm((f) => ({ ...f, taxaJurosMensal: e.target.value }))} placeholder="Ex.: 1.99" />
            </label>
            <label className="full">
              Sistema de amortização
              <select value={form.sistemaAmortizacao} onChange={(e) => setForm((f) => ({ ...f, sistemaAmortizacao: e.target.value }))}>
                {SISTEMAS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label>
              Total de parcelas <span className="required">*</span>
              <input type="number" min="1" max="600" value={form.totalParcelas} onChange={(e) => setForm((f) => ({ ...f, totalParcelas: e.target.value }))} />
            </label>
            <label>
              Parcelas JÁ pagas (contrato antigo)
              <input type="number" min="0" value={form.parcelasJaPagas} onChange={(e) => setForm((f) => ({ ...f, parcelasJaPagas: e.target.value }))} title="Migração: quantas parcelas já foram quitadas antes do cadastro — só as restantes entram no contas a pagar" />
            </label>
            {ehParcelaInformada && (
              <label>
                Valor da parcela (carnê) <span className="required">*</span>
                <input type="number" min="0.01" step="0.01" value={form.valorParcela} onChange={(e) => setForm((f) => ({ ...f, valorParcela: e.target.value }))} />
              </label>
            )}
            <label>
              1º vencimento do contrato <span className="required">*</span>
              <input type="date" value={form.primeiroVencimento} onChange={(e) => setForm((f) => ({ ...f, primeiroVencimento: e.target.value }))} title="Vencimento da PRIMEIRA parcela do contrato (mesmo as já pagas); as demais são mensais no mesmo dia" />
            </label>
            <label>
              Conta de débito padrão
              <select value={form.contaBancariaId} onChange={(e) => setForm((f) => ({ ...f, contaBancariaId: e.target.value }))}>
                <option value="">— escolher no pagamento —</option>
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
              <input value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} placeholder="Garantias, carência, renegociação…" />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "0 16px 16px" }}>
            <button type="button" className="btn-erp ghost sm" disabled={busy} onClick={simular}>
              {busy ? "…" : "Simular cronograma"}
            </button>
            <button type="button" className="btn-erp primary sm" disabled={busy || !sim} title={sim ? "Salvar o contrato e gerar as parcelas" : "Simule o cronograma antes de salvar"} onClick={salvar}>
              {busy ? "Salvando…" : "Salvar contrato"}
            </button>
          </div>

          {sim && (
            <div style={{ padding: "0 16px 16px" }}>
              <div className="kpi-row">
                <div className="kpi"><span className="kpi-label">Total a pagar</span><strong>{brl(sim.resumo.totalPagar)}</strong></div>
                <div className="kpi"><span className="kpi-label">Total de juros</span><strong>{brl(sim.resumo.totalJuros)}</strong></div>
                <div className="kpi"><span className="kpi-label">Saldo devedor atual</span><strong>{brl(sim.resumo.saldoDevedorAtual)}</strong></div>
                <div className="kpi"><span className="kpi-label">Parcelas restantes</span><strong>{sim.resumo.parcelasRestantes}</strong></div>
              </div>
              <CronogramaTabela linhas={sim.cronograma} />
            </div>
          )}
        </div>
      )}

      <div className="erp-table-wrap">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Contrato</th><th>Sistema</th><th className="num">Principal</th><th className="num">Taxa a.m.</th>
              <th>Progresso</th><th className="num">Saldo devedor</th><th>Próxima parcela</th><th>Situação</th><th className="actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {emprestimos.map((e) => (
              <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => abrirDetalhe(e.id)} title="Ver cronograma completo">
                <td>
                  <strong>{e.instituicao}</strong>
                  <small className="block-muted">{e.tipo.toLowerCase()}{e.numeroContrato ? ` · ${e.numeroContrato}` : ""} · contratado em {dataBr(e.dataContratacao)}</small>
                </td>
                <td>{e.sistemaAmortizacao}</td>
                <td className="num">{brl(e.valorPrincipal)}</td>
                <td className="num">{e.taxaJurosMensal ? `${e.taxaJurosMensal}%` : "—"}</td>
                <td>
                  {e.parcelasPagas}/{e.totalParcelas} pagas
                  {e.parcelasVencidas > 0 && <small className="block-muted" style={{ color: "#c62828" }}>{e.parcelasVencidas} vencida(s)</small>}
                </td>
                <td className="num"><strong>{brl(e.saldoDevedor)}</strong></td>
                <td>{e.proximaParcela ? `${dataBr(e.proximaParcela.vencimento)} · ${brl(e.proximaParcela.valor)}` : "—"}</td>
                <td>
                  <span className={`pill ${e.status === "ATIVO" ? "info" : e.status === "QUITADO" ? "success" : "mute"}`}>
                    <span className="dot" />{e.status.toLowerCase()}
                  </span>
                </td>
                <td className="actions" onClick={(ev) => ev.stopPropagation()}>
                  <button type="button" className="btn-erp ghost xs" disabled={busy} onClick={() => abrirDetalhe(e.id)}>Cronograma</button>
                  {e.status === "ATIVO" && (
                    <button type="button" className="btn-erp danger xs" disabled={busy} onClick={() => cancelar(e)}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
            {!emprestimos.length && (
              <tr><td colSpan={9}><div className="empty-st"><h4>Nenhum contrato</h4><p>Cadastre o primeiro empréstimo/financiamento — inclusive contratos antigos em andamento.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detalhe && (
        <>
          <div className="drawer-bd" onClick={() => setDetalhe(null)} />
          <aside className="drawer" style={{ width: "min(720px, 96vw)" }}>
            <header className="drawer-head">
              <h2>{detalhe.instituicao}{detalhe.numeroContrato ? ` · ${detalhe.numeroContrato}` : ""}</h2>
              <button type="button" className="btn-erp ghost xs" onClick={() => setDetalhe(null)}>Fechar</button>
            </header>
            <div className="drawer-body" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="kpi-row">
                <div className="kpi"><span className="kpi-label">Saldo devedor</span><strong>{brl(detalhe.saldoDevedor)}</strong></div>
                <div className="kpi"><span className="kpi-label">Pagas</span><strong>{detalhe.parcelasPagas}/{detalhe.totalParcelas}</strong></div>
                <div className="kpi"><span className="kpi-label">Total de juros</span><strong>{brl(detalhe.totalJurosContrato)}</strong></div>
                <div className="kpi"><span className="kpi-label">Total do contrato</span><strong>{brl(detalhe.totalPagar)}</strong></div>
              </div>
              <div style={{ fontSize: 12, color: "var(--erp-slate)" }}>
                {detalhe.sistemaAmortizacao} · {detalhe.taxaJurosMensal ? `${detalhe.taxaJurosMensal}% a.m.` : "sem juros"} ·
                conta: {detalhe.contaBancariaNome ?? "—"} · classificação: {detalhe.classificacaoNome ?? "—"}
                {detalhe.observacoes ? ` · ${detalhe.observacoes}` : ""}
              </div>
              <CronogramaTabela linhas={detalhe.cronograma} />
            </div>
          </aside>
        </>
      )}
    </section>
  );
}

function CronogramaTabela({ linhas }: { linhas: LinhaSimulacao[] }) {
  return (
    <div className="erp-table-wrap" style={{ marginTop: 8, maxHeight: 420, overflowY: "auto" }}>
      <table className="erp-table">
        <thead>
          <tr><th>#</th><th>Vencimento</th><th className="num">Parcela</th><th className="num">Juros</th><th className="num">Amortização</th><th className="num">Saldo devedor</th><th>Situação</th></tr>
        </thead>
        <tbody>
          {linhas.map((p) => {
            const paga = p.jaPaga || p.situacao?.startsWith("PAGA");
            return (
              <tr key={p.numero} style={paga ? { opacity: 0.55 } : undefined}>
                <td className="mono">{p.numero}</td>
                <td>{dataBr(p.vencimento)}</td>
                <td className="num"><strong>{brl(p.valor)}</strong></td>
                <td className="num">{brl(p.juros)}</td>
                <td className="num">{brl(p.amortizacao)}</td>
                <td className="num">{brl(p.saldoDevedorApos)}</td>
                <td style={{ fontSize: 12 }}>
                  {p.situacao ?? (p.jaPaga ? "PAGA (antes do cadastro)" : "a gerar")}
                  {p.pagoEm ? ` em ${dataBr(p.pagoEm)}` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
