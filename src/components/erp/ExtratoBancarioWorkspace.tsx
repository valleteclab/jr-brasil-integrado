"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { baixarCsv } from "@/lib/export/csv";

/**
 * EXTRATO BANCÁRIO em duas abas:
 *  - "Extrato do banco": SOMENTE o que veio do banco (extrato puro), sem anotações do ERP.
 *  - "Conciliação": banco × ERP lado a lado (conciliado / só no banco / só no ERP), com o
 *    checklist da diferença de saldos e o destaque de créditos de antecipação de recebíveis.
 * Uma consulta só alimenta as duas abas (o endpoint devolve o extrato já comparado).
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
  diferenca?: {
    saldoBanco: number | null;
    saldoErp: number;
    diferenca: number | null;
    totalSoBanco: number;
    totalSoErp: number;
    explicada: boolean;
  };
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
  const [aba, setAba] = useState<"extrato" | "conciliacao">("extrato");

  // Extrato PURO: só as linhas que vieram do banco, na ordem do banco.
  const linhasBanco = useMemo(() => (resultado?.linhas ?? []).filter((l) => l.origem === "BANCO"), [resultado]);
  const totais = useMemo(() => {
    const creditos = linhasBanco.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
    const debitos = linhasBanco.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0);
    return { creditos, debitos };
  }, [linhasBanco]);

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

  function exportar() {
    if (!resultado) return;
    if (aba === "extrato") {
      baixarCsv(`extrato-${resultado.conta.nome}-${resultado.periodo.mes}-${resultado.periodo.ano}`, linhasBanco.map((l) => ({
        Data: l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "",
        Descrição: l.descricao,
        Documento: l.documento ?? "",
        Valor: l.valor
      })), { Valor: "moeda" });
      return;
    }
    baixarCsv(`conciliacao-${resultado.conta.nome}-${resultado.periodo.mes}-${resultado.periodo.ano}`, resultado.linhas.map((l) => ({
      Data: l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "",
      Origem: l.origem,
      Descrição: l.descricao,
      Documento: l.documento ?? "",
      Valor: l.valor,
      Situação: l.situacao === "CONCILIADO" ? "Conciliado" : l.situacao === "SO_BANCO" ? "Só no banco" : "Só no ERP",
      "Casado com (ERP)": l.casadoCom ?? "",
      Antecipação: l.pareceAntecipacao ? "Sim" : ""
    })), { Valor: "moeda" });
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
        {resultado && resultado.linhas.length > 0 && (
          <button type="button" className="btn-erp ghost sm" onClick={exportar}>⬇ Exportar CSV</button>
        )}
      </div>

      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}

      {resultado && (
        <>
          <nav className="tabs" style={{ marginTop: 12, padding: 0, background: "#fff", border: "1px solid var(--erp-line)", borderBottom: 0, borderRadius: "8px 8px 0 0" }}>
            <button className={aba === "extrato" ? "active" : ""} type="button" onClick={() => setAba("extrato")}>
              Extrato do banco <span className="pill mute" style={{ marginLeft: 6, fontSize: 9 }}>{linhasBanco.length}</span>
            </button>
            <button className={aba === "conciliacao" ? "active" : ""} type="button" onClick={() => setAba("conciliacao")}>
              Conciliação bancária{" "}
              <span className="pill mute" style={{ marginLeft: 6, fontSize: 9 }}>
                {resultado.resumo.soBanco + resultado.resumo.soErp} pendente(s)
              </span>
            </button>
          </nav>

          {aba === "extrato" ? (
            <>
              {/* EXTRATO PURO — somente o que o banco devolveu, sem anotações do ERP. */}
              <div className="kpi-row" style={{ marginTop: 12 }}>
                <div className="kpi"><span className="kpi-label">Saldo no banco</span><strong>{resultado.saldoBanco != null ? brl(resultado.saldoBanco) : "—"}</strong></div>
                <div className="kpi"><span className="kpi-label">Entradas no período</span><strong style={{ color: "#1b5e20" }}>{brl(totais.creditos)}</strong></div>
                <div className="kpi"><span className="kpi-label">Saídas no período</span><strong style={{ color: "#c62828" }}>{brl(totais.debitos)}</strong></div>
                <div className="kpi"><span className="kpi-label">Transações</span><strong>{linhasBanco.length}</strong></div>
              </div>
              <div className="erp-table-wrap" style={{ marginTop: 12 }}>
                <table className="erp-table">
                  <thead>
                    <tr><th>Data</th><th>Descrição</th><th>Doc.</th><th className="num">Valor</th></tr>
                  </thead>
                  <tbody>
                    {linhasBanco.map((l, i) => (
                      <tr key={i}>
                        <td>{l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"}</td>
                        <td><strong>{l.descricao}</strong></td>
                        <td className="mono">{l.documento ?? "—"}</td>
                        <td className="num" style={{ color: l.valor < 0 ? "#c62828" : "#1b5e20" }}>{brl(l.valor)}</td>
                      </tr>
                    ))}
                    {!linhasBanco.length && (
                      <tr><td colSpan={4}><div className="empty-st"><h4>Sem transações no período</h4></div></td></tr>
                    )}
                  </tbody>
                </table>
                <div className="erp-table-foot">
                  <span>
                    {linhasBanco.length} transação(ões) · período {String(resultado.periodo.diaInicial).padStart(2, "0")}–
                    {String(resultado.periodo.diaFinal).padStart(2, "0")}/{String(resultado.periodo.mes).padStart(2, "0")}/{resultado.periodo.ano}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* CONCILIAÇÃO — banco × ERP, com pendências e checklist da diferença. */}
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

              {resultado.diferenca && resultado.diferenca.diferenca != null && (
                <div className={`alert ${resultado.diferenca.explicada ? "success" : "warn"}`} style={{ marginTop: 12, display: "block" }}>
                  <div className="lead" style={{ marginBottom: 6 }}>
                    {resultado.diferenca.explicada
                      ? "✓ Diferença explicada pelos lançamentos pendentes"
                      : "⚠ Diferença entre banco e ERP a investigar"}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    Saldo banco {brl(resultado.diferenca.saldoBanco ?? 0)} − saldo ERP {brl(resultado.diferenca.saldoErp)} ={" "}
                    <strong>{brl(resultado.diferenca.diferenca)}</strong>.<br />
                    Créditos só no banco: <strong>{brl(resultado.diferenca.totalSoBanco)}</strong> · Lançamentos só no ERP:{" "}
                    <strong>{brl(resultado.diferenca.totalSoErp)}</strong>.
                    {resultado.diferenca.explicada
                      ? " Os itens pendentes fecham a diferença — concilie-os para zerar."
                      : " A soma dos pendentes não fecha a diferença: revise datas, valores ou lançamentos faltando."}
                  </div>
                </div>
              )}

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
        </>
      )}
    </section>
  );
}
