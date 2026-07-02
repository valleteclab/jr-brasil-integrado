"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * CONCILIAÇÃO BANCÁRIA: consulta o extrato da conta no Sicoob e compara com os movimentos do ERP.
 * Créditos com cara de ANTECIPAÇÃO DE RECEBÍVEIS são destacados e, quando batem com uma operação
 * registrada na tela de Antecipação, ganham o link direto.
 */

type Linha = {
  origem: "BANCO" | "ERP";
  data: string | null;
  descricao: string;
  documento: string | null;
  valor: number;
  situacao: "CONCILIADO" | "SO_BANCO" | "SO_ERP";
  pareceAntecipacao: boolean;
  antecipacaoId: string | null;
  casadoCom: string | null;
};

type Resultado = {
  conta: { id: string; nome: string };
  periodo: { mes: number; ano: number; diaInicial: number; diaFinal: number };
  saldoBanco: number | null;
  saldoErp: number;
  linhas: Linha[];
  resumo: { conciliadas: number; soBanco: number; soErp: number; antecipacoesDetectadas: number };
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SITUACAO: Record<Linha["situacao"], { label: string; tone: string }> = {
  CONCILIADO: { label: "Conciliado", tone: "success" },
  SO_BANCO: { label: "Só no banco", tone: "warn" },
  SO_ERP: { label: "Só no ERP", tone: "danger" }
};

export function ExtratoBancarioWorkspace({ contas }: { contas: Array<{ id: string; nome: string; temContaCorrente: boolean }> }) {
  const hoje = new Date();
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function consultar() {
    if (!contaId) return;
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/financeiro/contas-bancarias/${contaId}/extrato?mes=${mes}&ano=${ano}`);
      const data = (await res.json().catch(() => ({}))) as Resultado & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível consultar o extrato.");
      setResultado(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao consultar o extrato.");
      setResultado(null);
    } finally {
      setBusy(false);
    }
  }

  if (!contas.length) {
    return (
      <div className="erp-card" style={{ padding: 20 }}>
        Nenhuma conta com credenciamento Sicoob. Configure em <strong>Configurações → Contas financeiras → Cobrança Sicoob</strong>{" "}
        (o extrato usa o mesmo credenciamento e exige o nº da conta corrente).
      </div>
    );
  }

  return (
    <section>
      <div className="erp-toolbar" style={{ gap: 8 }}>
        <select value={contaId} onChange={(e) => setContaId(e.target.value)} style={{ height: 34 }}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}{c.temContaCorrente ? "" : " (sem nº da conta corrente)"}</option>
          ))}
        </select>
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ height: 34 }}>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>)}
        </select>
        <input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value) || hoje.getFullYear())} style={{ width: 90, height: 34 }} />
        <button type="button" className="btn-erp primary sm" disabled={busy} onClick={consultar}>
          {busy ? "Consultando…" : "Consultar extrato"}
        </button>
        <div className="grow" />
      </div>

      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}

      {resultado && (
        <>
          <div className="kpi-row" style={{ marginTop: 12 }}>
            <div className="kpi"><span className="kpi-label">Saldo no banco</span><strong>{resultado.saldoBanco != null ? brl(resultado.saldoBanco) : "—"}</strong></div>
            <div className="kpi"><span className="kpi-label">Saldo no ERP</span><strong>{brl(resultado.saldoErp)}</strong></div>
            <div className="kpi"><span className="kpi-label">Conciliadas</span><strong>{resultado.resumo.conciliadas}</strong></div>
            <div className="kpi"><span className="kpi-label">Só no banco</span><strong>{resultado.resumo.soBanco}</strong></div>
            <div className="kpi"><span className="kpi-label">Só no ERP</span><strong>{resultado.resumo.soErp}</strong></div>
            {resultado.resumo.antecipacoesDetectadas > 0 && (
              <div className="kpi"><span className="kpi-label">Créditos de antecipação</span><strong>{resultado.resumo.antecipacoesDetectadas}</strong></div>
            )}
          </div>

          <div className="erp-table-wrap" style={{ marginTop: 12 }}>
            <table className="erp-table">
              <thead>
                <tr><th>Data</th><th>Descrição</th><th>Doc.</th><th className="num">Valor</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {resultado.linhas.map((l, i) => (
                  <tr key={i}>
                    <td>{l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"}</td>
                    <td>
                      <strong>{l.descricao}</strong>
                      {l.casadoCom && <small className="block-muted">↔ ERP: {l.casadoCom}</small>}
                      {l.pareceAntecipacao && (
                        <small className="block-muted" style={{ color: "var(--erp-yellow-dk, #b8860b)" }}>
                          💰 Crédito de antecipação de recebíveis{" "}
                          {l.antecipacaoId
                            ? <Link href="/erp/financeiro/antecipacao" style={{ textDecoration: "underline" }}>(operação registrada no ERP)</Link>
                            : <Link href="/erp/financeiro/antecipacao" style={{ textDecoration: "underline" }}>(registre a operação na tela de Antecipação)</Link>}
                        </small>
                      )}
                    </td>
                    <td className="mono">{l.documento ?? "—"}</td>
                    <td className="num" style={{ color: l.valor < 0 ? "#c62828" : "#1b5e20" }}>{brl(l.valor)}</td>
                    <td>
                      <span className={`pill ${SITUACAO[l.situacao].tone}`}>
                        <span className="dot" />
                        {SITUACAO[l.situacao].label}{l.origem === "ERP" ? " (movimento do ERP)" : ""}
                      </span>
                    </td>
                  </tr>
                ))}
                {!resultado.linhas.length && (
                  <tr><td colSpan={5}><div className="empty-st"><h4>Sem transações no período</h4></div></td></tr>
                )}
              </tbody>
            </table>
            <div className="erp-table-foot">
              <span>
                {resultado.linhas.length} linha(s) · período {String(resultado.periodo.diaInicial).padStart(2, "0")}–
                {String(resultado.periodo.diaFinal).padStart(2, "0")}/{String(resultado.periodo.mes).padStart(2, "0")}/{resultado.periodo.ano}
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
