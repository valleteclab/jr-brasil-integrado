"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApuracaoPresumido } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import type { ObraResumo } from "@/domains/fiscal/presumido/obras-use-cases";
import type { ApuracaoPisCofins } from "@/domains/fiscal/presumido/pis-cofins-use-cases";

/**
 * Apuração do IRPJ/CSLL do Lucro Presumido (e estimativa do Lucro Real): receita classificada nota
 * a nota, com o percentual de presunção de cada uma e o motivo. A obra por empreitada total entra
 * a 8%/12% sobre a receita bruta inteira — o vínculo com o contrato é feito aqui mesmo, na linha.
 */

type Props = {
  inicial: ApuracaoPresumido | null;
  obrasIniciais: ObraResumo[];
  anoInicial: number;
  trimestreInicial: number;
  mesInicial: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")}%`;
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const MODALIDADES: Array<{ valor: ObraResumo["modalidade"]; rotulo: string }> = [
  { valor: "TOTAL", rotulo: "Empreitada total (fornece todo o material) — 8% / 12%" },
  { valor: "PARCIAL", rotulo: "Empreitada parcial (só mão de obra / material parcial) — 32%" },
  { valor: "ADMINISTRACAO", rotulo: "Administração — 32%" }
];

export function PresumidoWorkspace({ inicial, obrasIniciais, anoInicial, trimestreInicial, mesInicial }: Props) {
  const [ano, setAno] = useState(anoInicial);
  const [trimestre, setTrimestre] = useState(trimestreInicial);
  const [dados, setDados] = useState<ApuracaoPresumido | null>(inicial);
  const [obras, setObras] = useState<ObraResumo[]>(obrasIniciais);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [novaObra, setNovaObra] = useState({ numero: "", contratante: "", modalidade: "TOTAL" as ObraResumo["modalidade"], observacoes: "" });
  const [mostrarObras, setMostrarObras] = useState(false);
  const [aba, setAba] = useState<"IRPJ" | "PIS">("IRPJ");
  const [novaReceita, setNovaReceita] = useState({ competencia: "", tipo: "FINANCEIRA", descricao: "", valor: "" });
  const [mostrarReceitas, setMostrarReceitas] = useState(false);
  const [mes, setMes] = useState(mesInicial);
  const [pis, setPis] = useState<ApuracaoPisCofins | null>(null);

  const carregar = useCallback(
    async (a = ano, t = trimestre) => {
      setBusy(true);
      setErro("");
      try {
        const r = await fetch(`/api/erp/fiscal/presumido/apuracao?ano=${a}&trimestre=${t}`);
        const json = (await r.json()) as ApuracaoPresumido & { error?: string };
        if (!r.ok) throw new Error(json.error || "Falha na apuração.");
        setDados(json);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha na apuração.");
      } finally {
        setBusy(false);
      }
    },
    [ano, trimestre]
  );

  const carregarPis = useCallback(
    async (a = ano, m = mes) => {
      setBusy(true);
      setErro("");
      try {
        const r = await fetch(`/api/erp/fiscal/presumido/pis-cofins?ano=${a}&mes=${m}`);
        const json = (await r.json()) as ApuracaoPisCofins & { error?: string };
        if (!r.ok) throw new Error(json.error || "Falha na apuração do PIS/COFINS.");
        setPis(json);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha na apuração do PIS/COFINS.");
      } finally {
        setBusy(false);
      }
    },
    [ano, mes]
  );

  useEffect(() => {
    if (aba === "PIS" && !pis) void carregarPis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);

  useEffect(() => {
    if (!inicial) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function trocarRegime(caixa: boolean) {
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch("/api/erp/fiscal/presumido/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regimeReceitaCaixa: caixa })
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao salvar o regime.");
      setOk(caixa ? "Regime de caixa ativado: a receita passa a ser o recebido no trimestre." : "Regime de competência ativado: a receita é a emitida no trimestre.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar o regime.");
    } finally {
      setBusy(false);
    }
  }

  async function salvarObra() {
    if (!novaObra.numero.trim()) {
      setErro("Informe o número do contrato.");
      return;
    }
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch("/api/erp/fiscal/presumido/obras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novaObra)
      });
      const json = (await r.json()) as { obra?: ObraResumo; error?: string };
      if (!r.ok || !json.obra) throw new Error(json.error || "Falha ao salvar o contrato.");
      setObras((lista) => [json.obra as ObraResumo, ...lista.filter((o) => o.id !== json.obra!.id)]);
      setNovaObra({ numero: "", contratante: "", modalidade: "TOTAL", observacoes: "" });
      setOk(`Contrato ${json.obra.numero} salvo.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar o contrato.");
    } finally {
      setBusy(false);
    }
  }

  async function vincular(notaId: string, obraId: string) {
    setBusy(true);
    setErro("");
    try {
      const r = await fetch("/api/erp/fiscal/presumido/vinculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notaId, obraId: obraId || null })
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao vincular.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao vincular.");
    } finally {
      setBusy(false);
    }
  }

  async function fechar(tipo: "IRPJ_CSLL" | "PIS_COFINS", periodo: number, reabrir = false) {
    if (reabrir && !window.confirm("Reabrir apaga o fechamento e volta a recalcular o período. O valor fechado fica registrado na auditoria. Confirma?")) return;
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch("/api/erp/fiscal/presumido/fechamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, ano, periodo, reabrir })
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao fechar o período.");
      setOk(reabrir ? "Período reaberto." : "Período fechado: o valor apurado ficou guardado para conferência.");
      if (tipo === "PIS_COFINS") await carregarPis();
      else await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao fechar o período.");
    } finally {
      setBusy(false);
    }
  }

  async function salvarReceita() {
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const r = await fetch("/api/erp/fiscal/presumido/outras-receitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...novaReceita, valor: Number(String(novaReceita.valor).replace(",", ".")) })
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao salvar a receita.");
      setNovaReceita({ competencia: "", tipo: "FINANCEIRA", descricao: "", valor: "" });
      setOk("Receita lançada.");
      await carregar();
      if (pis) await carregarPis();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar a receita.");
    } finally {
      setBusy(false);
    }
  }

  async function excluirReceita(id: string) {
    setBusy(true);
    setErro("");
    try {
      const r = await fetch(`/api/erp/fiscal/presumido/outras-receitas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(json.error || "Falha ao excluir.");
      await carregar();
      if (pis) await carregarPis();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }

  const t = dados?.totais;

  return (
    <div>
      <div className="erp-tabs" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className={`btn-erp sm ${aba === "IRPJ" ? "primary" : "ghost"}`}
          onClick={() => setAba("IRPJ")}
        >
          IRPJ / CSLL · trimestral
        </button>
        <button
          type="button"
          className={`btn-erp sm ${aba === "PIS" ? "primary" : "ghost"}`}
          onClick={() => setAba("PIS")}
        >
          PIS / COFINS · mensal
        </button>
      </div>

      {aba === "PIS" ? (
        <PisCofinsPainel
          dados={pis}
          ano={ano}
          mes={mes}
          anoInicial={anoInicial}
          busy={busy}
          erro={erro}
          onPeriodo={(a, m) => { setAno(a); setMes(m); void carregarPis(a, m); }}
          onFechar={(periodo, reabrir) => fechar("PIS_COFINS", periodo, reabrir)}
        />
      ) : (
      <>
      <div className="erp-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
        <select value={trimestre} onChange={(e) => { const v = Number(e.target.value); setTrimestre(v); void carregar(ano, v); }}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}º trimestre</option>)}
        </select>
        <select value={ano} onChange={(e) => { const v = Number(e.target.value); setAno(v); void carregar(v, trimestre); }}>
          {[anoInicial + 1, anoInicial, anoInicial - 1, anoInicial - 2].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button type="button" className="btn-erp primary sm" disabled={busy} onClick={() => void carregar()}>
          {busy ? "Apurando..." : "Atualizar"}
        </button>
        <div className="grow" />
        {dados && (
          <select
            value={dados.regimeReceita}
            disabled={busy}
            onChange={(e) => void trocarRegime(e.target.value === "CAIXA")}
            title="Competência = receita pela emissão da nota. Caixa = pelo recebimento (IN RFB 1.700/17, art. 223)."
          >
            <option value="COMPETENCIA">Regime de competência</option>
            <option value="CAIXA">Regime de caixa</option>
          </select>
        )}
        <button type="button" className="btn-erp ghost sm" onClick={() => setMostrarObras((v) => !v)}>
          🏗 Contratos de obra ({obras.length})
        </button>
        <a className="btn-erp ghost sm" href={`/api/erp/fiscal/presumido/exportar?tipo=IRPJ_CSLL&ano=${ano}&periodo=${trimestre}`}>
          ⤓ Exportar p/ contador
        </a>
        <button type="button" className="btn-erp ghost sm" onClick={() => setMostrarReceitas((v) => !v)}>
          ＄ Outras receitas{dados?.outrasReceitas.length ? ` (${dados.outrasReceitas.length})` : ""}
        </button>
        {dados?.fechamento ? (
          <button type="button" className="btn-erp ghost sm" disabled={busy} onClick={() => void fechar("IRPJ_CSLL", trimestre, true)}>
            🔓 Reabrir período
          </button>
        ) : (
          <button type="button" className="btn-erp sm" disabled={busy} onClick={() => void fechar("IRPJ_CSLL", trimestre)}>
            🔒 Fechar período
          </button>
        )}
      </div>

      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}
      {ok && <div className="alert success"><span className="lead">OK:</span><span>{ok}</span></div>}

      {mostrarObras && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-head"><h3>Contratos de obra</h3></div>
          <div style={{ padding: "0 16px 12px" }}>
            <p className="field-hint" style={{ marginTop: 0 }}>
              A modalidade do contrato é o que define a presunção da obra: na <strong>empreitada total</strong>, em que a
              empresa fornece todos os materiais indispensáveis e eles são incorporados à obra, a receita bruta inteira entra
              a 8% (IRPJ) e 12% (CSLL) — sem separar material de mão de obra. Base: IN RFB 1.700/2017, art. 33, § 1º, II e IV, &quot;d&quot;.
            </p>
            <div className="erp-form">
              <label>
                <span>Número do contrato</span>
                <input value={novaObra.numero} onChange={(e) => setNovaObra({ ...novaObra, numero: e.target.value })} placeholder="006/2026" />
              </label>
              <label>
                <span>Contratante</span>
                <input value={novaObra.contratante} onChange={(e) => setNovaObra({ ...novaObra, contratante: e.target.value })} placeholder="Câmara Municipal de ..." />
              </label>
              <label className="full">
                <span>Modalidade</span>
                <select value={novaObra.modalidade} onChange={(e) => setNovaObra({ ...novaObra, modalidade: e.target.value as ObraResumo["modalidade"] })}>
                  {MODALIDADES.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                </select>
              </label>
              <label className="full">
                <span>Observações (o que sustenta a modalidade)</span>
                <input
                  value={novaObra.observacoes}
                  onChange={(e) => setNovaObra({ ...novaObra, observacoes: e.target.value })}
                  placeholder="Ex.: implantação completa, material fornecido pela contratada conforme planilha contratual."
                />
              </label>
              <div className="full">
                <button type="button" className="btn-erp primary sm" disabled={busy} onClick={() => void salvarObra()}>Salvar contrato</button>
              </div>
            </div>

            {obras.length > 0 && (
              <table className="erp-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr><th>Contrato</th><th>Contratante</th><th>Modalidade</th><th className="num">Notas</th></tr>
                </thead>
                <tbody>
                  {obras.map((o) => (
                    <tr key={o.id}>
                      <td><strong>{o.numero}</strong>{o.observacoes && <small className="block-muted">{o.observacoes}</small>}</td>
                      <td>{o.contratante ?? "-"}</td>
                      <td>{o.modalidade === "TOTAL" ? "Empreitada total (8% / 12%)" : o.modalidade === "PARCIAL" ? "Empreitada parcial (32%)" : "Administração (32%)"}</td>
                      <td className="num">{o.notasVinculadas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {mostrarReceitas && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-head"><h3>Receitas fora de nota fiscal</h3></div>
          <div style={{ padding: "0 16px 12px" }}>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Rendimento de aplicação, aluguel e ganho de capital entram na base do IRPJ/CSLL <strong>integralmente, sem
              presunção</strong> (Lei 9.430/96, art. 25 II e art. 29 II). No PIS/COFINS, receita financeira só é tributada no
              regime não cumulativo, a 0,65% e 4% (Decreto 8.426/2015).
            </p>
            <div className="erp-form">
              <label>
                <span>Competência</span>
                <input type="date" value={novaReceita.competencia} onChange={(e) => setNovaReceita({ ...novaReceita, competencia: e.target.value })} />
              </label>
              <label>
                <span>Tipo</span>
                <select value={novaReceita.tipo} onChange={(e) => setNovaReceita({ ...novaReceita, tipo: e.target.value })}>
                  <option value="FINANCEIRA">Rendimento financeiro</option>
                  <option value="ALUGUEL">Aluguel</option>
                  <option value="GANHO_CAPITAL">Ganho de capital</option>
                  <option value="OUTRA">Outra</option>
                </select>
              </label>
              <label>
                <span>Descrição</span>
                <input value={novaReceita.descricao} onChange={(e) => setNovaReceita({ ...novaReceita, descricao: e.target.value })} placeholder="Rendimento do CDB em setembro" />
              </label>
              <label>
                <span>Valor</span>
                <input inputMode="decimal" value={novaReceita.valor} onChange={(e) => setNovaReceita({ ...novaReceita, valor: e.target.value })} placeholder="0,00" />
              </label>
              <div className="full">
                <button type="button" className="btn-erp primary sm" disabled={busy} onClick={() => void salvarReceita()}>Lançar receita</button>
              </div>
            </div>

            {dados && dados.outrasReceitas.length > 0 && (
              <table className="erp-table" style={{ marginTop: 12 }}>
                <thead><tr><th>Descrição</th><th>Tipo</th><th>Competência</th><th className="num">Valor</th><th /></tr></thead>
                <tbody>
                  {dados.outrasReceitas.map((r) => (
                    <tr key={r.id}>
                      <td>{r.descricao}</td>
                      <td>{r.tipo.replace("_", " ").toLowerCase()}</td>
                      <td>{dia(r.competencia)}</td>
                      <td className="num">{brl(r.valor)}</td>
                      <td><button type="button" className="btn-erp ghost sm" disabled={busy} onClick={() => void excluirReceita(r.id)}>Excluir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {dados && t && (
        <>
          {dados.fechamento && (
            <div className={`alert ${dados.fechamento.divergencia !== 0 ? "danger" : "success"}`} style={{ marginBottom: 8 }}>
              <span className="lead">{dados.fechamento.divergencia !== 0 ? "⚠" : "🔒"}</span>
              <span>
                Período fechado em {dia(dados.fechamento.fechadoEm)} com total de <strong>{brl(dados.fechamento.totalRecolher)}</strong>.
                {dados.fechamento.divergencia !== 0
                  ? ` A base mudou depois do fechamento: o recálculo dá ${brl(t.totalRecolher)} (diferença de ${brl(dados.fechamento.divergencia)}). Avalie retificar ou complementar.`
                  : " O recálculo continua batendo com o que foi fechado."}
              </span>
            </div>
          )}
          {dados.avisos.map((a, i) => (
            <div key={i} className="alert warn" style={{ marginBottom: 8 }}><span className="lead">⚠</span><span>{a}</span></div>
          ))}

          <div className="erp-card" style={{ marginBottom: 16 }}>
            <div className="erp-card-head">
              <h3>{dados.periodo.rotulo} · {dados.regimeReceita === "CAIXA" ? "regime de caixa" : "regime de competência"}</h3>
              <span className="field-hint">Vencimento da quota única: {dia(dados.periodo.vencimento)}</span>
            </div>
            <div className="kpi-row">
              <div className="kpi"><span className="kpi-label">Receita do trimestre</span><strong>{brl(t.receita)}</strong></div>
              <div className="kpi"><span className="kpi-label">Base do IRPJ</span><strong>{brl(t.baseIrpj)}</strong></div>
              <div className="kpi"><span className="kpi-label">IRPJ a recolher · DARF {dados.darf.irpj}</span><strong>{brl(Math.max(t.irpjRecolher, 0))}</strong></div>
              <div className="kpi"><span className="kpi-label">CSLL a recolher · DARF {dados.darf.csll}</span><strong>{brl(Math.max(t.csllRecolher, 0))}</strong></div>
              <div className="kpi"><span className="kpi-label">Total do trimestre</span><strong style={{ color: "#0b6b36" }}>{brl(t.totalRecolher)}</strong></div>
            </div>
          </div>

          <div className="erp-card" style={{ marginBottom: 16 }}>
            <div className="erp-card-head"><h3>Memória de cálculo</h3></div>
            <table className="erp-table">
              <thead>
                <tr><th>Tipo de receita</th><th className="num">Receita</th><th className="num">Presunção IRPJ</th><th className="num">Base IRPJ</th><th className="num">Presunção CSLL</th><th className="num">Base CSLL</th><th>Base legal</th></tr>
              </thead>
              <tbody>
                {dados.grupos.map((g) => (
                  <tr key={g.tipo}>
                    <td><strong>{g.rotulo}</strong><small className="block-muted">{g.notas} nota(s)</small></td>
                    <td className="num">{brl(g.receita)}</td>
                    <td className="num">{pct(g.presuncaoIrpj)}</td>
                    <td className="num">{brl(g.baseIrpj)}</td>
                    <td className="num">{pct(g.presuncaoCsll)}</td>
                    <td className="num">{brl(g.baseCsll)}</td>
                    <td><small className="block-muted">{g.baseLegal}</small></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Totais</th>
                  <th className="num">{brl(t.receita)}</th>
                  <th />
                  <th className="num">{brl(t.baseIrpj)}</th>
                  <th />
                  <th className="num">{brl(t.baseCsll)}</th>
                  <th />
                </tr>
              </tfoot>
            </table>

            <div className="erp-form" style={{ padding: 16 }}>
              <div className="full" style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <div>IRPJ 15% sobre a base: <strong>{brl(t.irpjNormal)}</strong></div>
                <div>Adicional de 10% sobre o que excede {brl(t.limiteAdicional)} no trimestre: <strong>{brl(t.irpjAdicional)}</strong></div>
                <div>(–) IRRF retido na fonte: <strong>{brl(t.irrfRetido)}</strong></div>
                <div><strong>IRPJ a recolher: {brl(t.irpjRecolher)}</strong></div>
                <div style={{ marginTop: 6 }}>CSLL 9% sobre a base: <strong>{brl(t.csllDevida)}</strong></div>
                <div>(–) CSLL retida na fonte: <strong>{brl(t.csllRetida)}</strong></div>
                <div><strong>CSLL a recolher: {brl(t.csllRecolher)}</strong></div>
              </div>
            </div>
          </div>

          <div className="erp-card">
            <div className="erp-card-head"><h3>Notas do trimestre ({dados.linhas.length})</h3></div>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Nota</th><th>Data</th><th>Tomador</th><th className="num">Receita</th>
                  <th className="num">IRRF</th><th>Classificação</th><th>Contrato de obra</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={`${l.notaId}-${l.data}`}>
                    <td><strong>{l.modelo} {l.numero}</strong>{l.serie && <small className="block-muted">Série {l.serie}</small>}</td>
                    <td>{dia(l.data)}{l.parcial && <small className="block-muted">recebimento parcial</small>}</td>
                    <td>{l.destinatario || "-"}</td>
                    <td className="num">{brl(l.valor)}</td>
                    <td className="num">{brl(l.irrf)}{l.irrf > 0 && <small className="block-muted">{pct(l.irrfPercentual)}</small>}</td>
                    <td>
                      {l.rotulo} <small className="block-muted">{pct(l.presuncaoIrpj)} IRPJ · {pct(l.presuncaoCsll)} CSLL</small>
                      <small className="block-muted">{l.motivo}</small>
                      {l.avisos.map((a, i) => (
                        <small key={i} className="block-muted" style={{ color: "#b26a00" }}>⚠ {a}</small>
                      ))}
                    </td>
                    <td>
                      <select
                        value={obras.find((o) => o.numero === l.obraContrato)?.id ?? ""}
                        disabled={busy}
                        onChange={(e) => void vincular(l.notaId, e.target.value)}
                      >
                        <option value="">— sem contrato —</option>
                        {obras.map((o) => <option key={o.id} value={o.id}>{o.numero} ({o.modalidade === "TOTAL" ? "total" : o.modalidade === "PARCIAL" ? "parcial" : "administração"})</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </>
      )}
    </div>
  );
}

/** Apuração mensal de PIS/COFINS — cumulativo no presumido, não cumulativo no real. */
function PisCofinsPainel({
  dados,
  ano,
  mes,
  anoInicial,
  busy,
  erro,
  onPeriodo,
  onFechar
}: {
  dados: ApuracaoPisCofins | null;
  ano: number;
  mes: number;
  anoInicial: number;
  busy: boolean;
  erro: string;
  onPeriodo: (ano: number, mes: number) => void;
  onFechar: (periodo: number, reabrir?: boolean) => Promise<void>;
}) {
  const t = dados?.totais;
  const MESES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  return (
    <div>
      <div className="erp-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
        <select value={mes} disabled={busy} onChange={(e) => onPeriodo(ano, Number(e.target.value))}>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={ano} disabled={busy} onChange={(e) => onPeriodo(Number(e.target.value), mes)}>
          {[anoInicial + 1, anoInicial, anoInicial - 1, anoInicial - 2].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button type="button" className="btn-erp primary sm" disabled={busy} onClick={() => onPeriodo(ano, mes)}>
          {busy ? "Apurando..." : "Atualizar"}
        </button>
        <div className="grow" />
        <a className="btn-erp ghost sm" href={`/api/erp/fiscal/presumido/exportar?tipo=PIS_COFINS&ano=${ano}&periodo=${mes}`}>
          ⤓ Exportar p/ contador
        </a>
        {dados?.fechamento ? (
          <button type="button" className="btn-erp ghost sm" disabled={busy} onClick={() => void onFechar(mes, true)}>🔓 Reabrir mês</button>
        ) : (
          <button type="button" className="btn-erp sm" disabled={busy} onClick={() => void onFechar(mes)}>🔒 Fechar mês</button>
        )}
      </div>

      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}

      {dados && t && (
        <>
          {dados.fechamento && (
            <div className={`alert ${dados.fechamento.divergencia !== 0 ? "danger" : "success"}`} style={{ marginBottom: 8 }}>
              <span className="lead">{dados.fechamento.divergencia !== 0 ? "⚠" : "🔒"}</span>
              <span>
                Mês fechado em {dia(dados.fechamento.fechadoEm)} com total de <strong>{brl(dados.fechamento.totalRecolher)}</strong>.
                {dados.fechamento.divergencia !== 0
                  ? ` O recálculo agora dá ${brl(t.totalRecolher)} (diferença de ${brl(dados.fechamento.divergencia)}).`
                  : " O recálculo continua batendo."}
              </span>
            </div>
          )}
          {dados.avisos.map((a, i) => (
            <div key={i} className="alert warn" style={{ marginBottom: 8 }}><span className="lead">⚠</span><span>{a}</span></div>
          ))}

          <div className="erp-card" style={{ marginBottom: 16 }}>
            <div className="erp-card-head">
              <h3>{dados.periodo.rotulo} · {dados.aliquotas.rotulo}</h3>
              <span className="field-hint">
                {dados.regimeReceita === "CAIXA" ? "Regime de caixa" : "Regime de competência"} · vencimento {dia(dados.periodo.vencimento)} · {dados.aliquotas.base}
              </span>
            </div>
            <div className="kpi-row">
              <div className="kpi"><span className="kpi-label">Receita bruta</span><strong>{brl(t.receitaBruta)}</strong></div>
              <div className="kpi"><span className="kpi-label">Exclusões da base</span><strong>{brl(t.exclusoes)}</strong></div>
              <div className="kpi"><span className="kpi-label">Base de cálculo</span><strong>{brl(t.baseCalculo)}</strong></div>
              <div className="kpi"><span className="kpi-label">PIS a recolher · DARF {dados.darf.pis}</span><strong>{brl(Math.max(t.pisRecolher, 0))}</strong></div>
              <div className="kpi"><span className="kpi-label">COFINS a recolher · DARF {dados.darf.cofins}</span><strong>{brl(Math.max(t.cofinsRecolher, 0))}</strong></div>
              <div className="kpi"><span className="kpi-label">Total do mês</span><strong style={{ color: "#0b6b36" }}>{brl(t.totalRecolher)}</strong></div>
            </div>
          </div>

          <div className="erp-card" style={{ marginBottom: 16 }}>
            <div className="erp-card-head"><h3>Memória de cálculo</h3></div>
            <table className="erp-table">
              <thead>
                <tr><th>Item</th><th className="num">PIS ({pct(dados.aliquotas.pis)})</th><th className="num">COFINS ({pct(dados.aliquotas.cofins)})</th></tr>
              </thead>
              <tbody>
                <tr><td>Débito sobre a base</td><td className="num">{brl(t.pisDebito)}</td><td className="num">{brl(t.cofinsDebito)}</td></tr>
                {dados.receitaFinanceira && (
                  <tr>
                    <td>Receita financeira {brl(dados.receitaFinanceira.valor)} · 0,65% e 4% <small className="block-muted">Decreto 8.426/2015</small></td>
                    <td className="num">{brl(dados.receitaFinanceira.pis)}</td>
                    <td className="num">{brl(dados.receitaFinanceira.cofins)}</td>
                  </tr>
                )}
                {dados.icmsExcluido > 0 && (
                  <tr>
                    <td colSpan={3}><small className="block-muted">ICMS destacado excluído da base: {brl(dados.icmsExcluido)} (STF, RE 574.706)</small></td>
                  </tr>
                )}
                {dados.regimeApuracao === "NAO_CUMULATIVO" && (
                  <tr><td>(–) Créditos das entradas</td><td className="num">{brl(t.pisCredito)}</td><td className="num">{brl(t.cofinsCredito)}</td></tr>
                )}
                <tr><td>(–) Retido na fonte</td><td className="num">{brl(t.pisRetido)}</td><td className="num">{brl(t.cofinsRetido)}</td></tr>
              </tbody>
              <tfoot>
                <tr><th>A recolher</th><th className="num">{brl(t.pisRecolher)}</th><th className="num">{brl(t.cofinsRecolher)}</th></tr>
              </tfoot>
            </table>
          </div>

          <div className="erp-card">
            <div className="erp-card-head"><h3>Notas do mês ({dados.linhas.length})</h3></div>
            <table className="erp-table">
              <thead>
                <tr><th>Nota</th><th>Data</th><th>Destinatário</th><th className="num">Na base</th><th className="num">Excluído</th><th>Motivo da exclusão</th></tr>
              </thead>
              <tbody>
                {dados.linhas.map((l, i) => (
                  <tr key={`${l.notaId}-${i}`}>
                    <td><strong>{l.modelo} {l.numero}</strong></td>
                    <td>{dia(l.data)}</td>
                    <td>{l.descricao || "-"}</td>
                    <td className="num">{brl(l.receita)}</td>
                    <td className="num">{l.excluida > 0 ? brl(l.excluida) : "-"}</td>
                    <td><small className="block-muted">{l.motivoExclusao ?? "-"}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
