"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
  /** Ambiente do movimento do ERP (homologação = teste, nunca bate com o banco real). */
  ambiente?: string | null;
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
  const [consultadoEm, setConsultadoEm] = useState("");
  // Conciliação manual de linha só-no-banco (lançar no ERP).
  const [classificacoes, setClassificacoes] = useState<Array<{ id: string; nome: string; tipo: string }>>([]);
  const [lancando, setLancando] = useState<{ linha: Linha; descricaoErp: string; classificacaoId: string } | null>(null);
  const [lancBusy, setLancBusy] = useState(false);

  // A consulta PERSISTE ao sair da tela: cada conta/período guarda o último resultado no navegador
  // e ele é restaurado ao voltar (o botão "Consultar" atualiza direto no banco quando quiser).
  const chaveCache = `erp:extrato:${contaId}:${ano}-${String(mes).padStart(2, "0")}`;
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(chaveCache);
      if (bruto) {
        const salvo = JSON.parse(bruto) as { resultado: Resultado; em: string };
        setResultado(salvo.resultado);
        setConsultadoEm(salvo.em);
        return;
      }
    } catch { /* cache corrompido → ignora */ }
    setResultado(null);
    setConsultadoEm("");
  }, [chaveCache]);

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
      const em = new Date().toLocaleString("pt-BR");
      setConsultadoEm(em);
      try { localStorage.setItem(chaveCache, JSON.stringify({ resultado: data, em })); } catch { /* sem espaço → segue sem cache */ }
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
      Antecipação: l.pareceAntecipacao ? "Sim" : "",
      Ambiente: l.origem === "ERP" ? (l.ambiente === "HOMOLOGACAO" ? "Homologação (teste)" : "Produção") : ""
    })), { Valor: "moeda" });
  }

  /** Abre o mini-formulário de lançamento para uma linha só-no-banco. */
  async function abrirLancamento(l: Linha) {
    if (!classificacoes.length) {
      try {
        const res = await fetch("/api/erp/financeiro/classificacoes");
        const d = (await res.json().catch(() => ({}))) as { classificacoes?: Array<{ id: string; nome: string; tipo: string; ativo?: boolean }> };
        setClassificacoes((d.classificacoes ?? []).filter((c) => c.ativo !== false).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })));
      } catch { /* sem classificações → lança sem */ }
    }
    setLancando({ linha: l, descricaoErp: l.descricao, classificacaoId: "" });
  }

  /** Confirma o lançamento: cria conta paga quitada (débito) ou crédito no ERP e re-consulta. */
  async function confirmarLancamento() {
    if (!lancando || !resultado) return;
    setLancBusy(true);
    setErro("");
    try {
      const l = lancando.linha;
      const res = await fetch(`/api/erp/financeiro/contas-bancarias/${resultado.conta.id}/extrato/lancar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: l.data,
          descricao: l.descricao,
          documento: l.documento,
          valor: l.valor,
          classificacaoId: lancando.classificacaoId || null,
          descricaoErp: lancando.descricaoErp.trim() || null
        })
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error || "Não foi possível lançar a transação.");
      setLancando(null);
      await consultar(); // re-consulta: a linha concilia com o lançamento novo e o cache é atualizado
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao lançar a transação.");
    } finally {
      setLancBusy(false);
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
        {consultadoEm && <small className="block-muted" title="Última consulta salva — o resultado fica guardado ao sair da tela.">consultado em {consultadoEm}</small>}
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
                <div className="kpi"><span className="kpi-label">Saldo no ERP (produção)</span><strong>{brl(resultado.saldoErp)}</strong></div>
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
                      <Fragment key={i}>
                      <tr>
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
                          {l.origem === "ERP" && l.ambiente === "HOMOLOGACAO" && (
                            <small className="block-muted" title="Movimento criado em ambiente de homologação (teste) — não passou pelo banco real.">🧪 homologação (teste)</small>
                          )}
                          {l.situacao === "SO_BANCO" && (
                            <div style={{ marginTop: 4 }}>
                              <button type="button" className="btn-erp light xs" disabled={lancBusy} onClick={() => abrirLancamento(l)} title="Registrar no ERP esta transação que só está no banco (ex.: conta paga fora do sistema, tarifa)">
                                ➕ Lançar no ERP
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {lancando && lancando.linha === l && (
                        <tr>
                          <td colSpan={5} style={{ background: "var(--erp-bg, #fafafa)" }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", padding: "6px 2px" }}>
                              <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 260px", fontSize: 12 }}>
                                Descrição do lançamento
                                <input value={lancando.descricaoErp} onChange={(e) => setLancando((cur) => (cur ? { ...cur, descricaoErp: e.target.value } : cur))} style={{ height: 34 }} />
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px", fontSize: 12 }}>
                                Classificação gerencial {l.valor < 0 ? "(despesa)" : "(receita)"}
                                <select value={lancando.classificacaoId} onChange={(e) => setLancando((cur) => (cur ? { ...cur, classificacaoId: e.target.value } : cur))} style={{ height: 34 }}>
                                  <option value="">Sem classificação…</option>
                                  {classificacoes.filter((c) => c.tipo === (l.valor < 0 ? "DESPESA" : "RECEITA")).map((c) => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                  ))}
                                </select>
                              </label>
                              <span style={{ fontSize: 12, paddingBottom: 8 }}>
                                {l.valor < 0
                                  ? <>Vai criar uma <strong>conta paga quitada</strong> de {brl(Math.abs(l.valor))} em {l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"} nesta conta.</>
                                  : <>Vai registrar um <strong>crédito</strong> de {brl(l.valor)} em {l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"} nesta conta.</>}
                              </span>
                              <button type="button" className="btn-erp primary sm" disabled={lancBusy} onClick={confirmarLancamento}>{lancBusy ? "Lançando…" : "Confirmar lançamento"}</button>
                              <button type="button" className="btn-erp ghost sm" disabled={lancBusy} onClick={() => setLancando(null)}>Cancelar</button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
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
