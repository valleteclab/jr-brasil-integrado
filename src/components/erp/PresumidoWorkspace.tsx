"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApuracaoPresumido } from "@/domains/fiscal/presumido/apuracao-presumido-use-cases";
import type { ObraResumo } from "@/domains/fiscal/presumido/obras-use-cases";

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
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")}%`;
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const MODALIDADES: Array<{ valor: ObraResumo["modalidade"]; rotulo: string }> = [
  { valor: "TOTAL", rotulo: "Empreitada total (fornece todo o material) — 8% / 12%" },
  { valor: "PARCIAL", rotulo: "Empreitada parcial (só mão de obra / material parcial) — 32%" },
  { valor: "ADMINISTRACAO", rotulo: "Administração — 32%" }
];

export function PresumidoWorkspace({ inicial, obrasIniciais, anoInicial, trimestreInicial }: Props) {
  const [ano, setAno] = useState(anoInicial);
  const [trimestre, setTrimestre] = useState(trimestreInicial);
  const [dados, setDados] = useState<ApuracaoPresumido | null>(inicial);
  const [obras, setObras] = useState<ObraResumo[]>(obrasIniciais);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [novaObra, setNovaObra] = useState({ numero: "", contratante: "", modalidade: "TOTAL" as ObraResumo["modalidade"], observacoes: "" });
  const [mostrarObras, setMostrarObras] = useState(false);

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

  const t = dados?.totais;

  return (
    <div>
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
        <button type="button" className="btn-erp ghost sm" onClick={() => window.print()}>🖨 Imprimir p/ contador</button>
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

      {dados && t && (
        <>
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
    </div>
  );
}
