"use client";

import { useEffect, useState } from "react";
import type { ApuracaoSimples } from "@/domains/fiscal/simples/apuracao-simples-use-cases";

/**
 * APURAÇÃO SIMPLES NACIONAL / MEI: DAS estimado com SEGREGAÇÃO de receitas (monofásico/ST) —
 * mostra quanto a empresa economiza segregando e serve de conferência do PGDAS-D do contador.
 * MEI: painel de limite anual com projeção. Estimativa gerencial; o oficial é o PGDAS-D.
 */

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ANEXOS_OPCOES = [
  { value: 1, label: "Anexo I — Comércio (revenda de mercadorias)" },
  { value: 2, label: "Anexo II — Indústria" },
  { value: 3, label: "Anexo III — Serviços (manutenção, oficina, instalação...)" },
  { value: 4, label: "Anexo IV — Serviços (limpeza, obras, advocacia)" },
  { value: 5, label: "Anexo V — Serviços intelectuais (sujeito ao Fator R)" }
];

export function SimplesWorkspace({ inicial, anexoSalvo, folhaSalva }: { inicial: ApuracaoSimples | null; anexoSalvo: number | null; folhaSalva: number | null }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [dados, setDados] = useState<ApuracaoSimples | null>(inicial);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [anexo, setAnexo] = useState<string>(anexoSalvo ? String(anexoSalvo) : "");
  const [folha, setFolha] = useState<string>(folhaSalva ? String(folhaSalva) : "");

  async function carregar(m = mes, a = ano) {
    setBusy(true);
    setErro("");
    try {
      const res = await fetch(`/api/erp/fiscal/simples/apuracao?mes=${m}&ano=${a}`);
      const data = (await res.json().catch(() => ({}))) as ApuracaoSimples & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível apurar.");
      setDados(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na apuração.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!inicial) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvarConfig() {
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const res = await fetch("/api/erp/fiscal/simples/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anexo: anexo ? Number(anexo) : null, folhaMensal: folha ? Number(folha) : null })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setOk("Configuração salva.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function detectarMonofasicos() {
    if (!window.confirm("Marcar como MONOFÁSICO os produtos cujo NCM está nas listas das leis (autopeças, medicamentos/perfumaria, bebidas frias, combustíveis)? A marcação só ATIVA a flag (nunca desmarca) e deve ser validada com o contador.")) return;
    setBusy(true);
    setErro("");
    setOk("");
    try {
      const res = await fetch("/api/erp/fiscal/simples/monofasicos", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { marcados?: number; porGrupo?: Record<string, number>; error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível detectar.");
      const detalhe = Object.entries(data.porGrupo ?? {}).map(([g, n]) => `${g}: ${n}`).join(" · ");
      setOk(`${data.marcados ?? 0} produto(s) marcados como monofásicos${detalhe ? ` (${detalhe})` : ""}. Recalculando…`);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na detecção.");
    } finally {
      setBusy(false);
    }
  }

  const ehMei = dados?.regime === "MEI";

  return (
    <section>
      <div className="erp-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ height: 34 }}>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>)}
        </select>
        <input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value) || hoje.getFullYear())} style={{ width: 90, height: 34 }} />
        <button type="button" className="btn-erp primary sm" disabled={busy} onClick={() => carregar()}>
          {busy ? "Apurando…" : "Apurar"}
        </button>
        <div className="grow" />
        {!ehMei && (
          <button type="button" className="btn-erp ghost sm" disabled={busy} onClick={detectarMonofasicos} title="Marca em massa os produtos com NCM monofásico (Leis 10.485, 10.147, 13.097, 9.718)">
            🔎 Detectar monofásicos por NCM
          </button>
        )}
        <button type="button" className="btn-erp ghost sm" onClick={() => window.print()}>🖨 Imprimir p/ contador</button>
      </div>

      {erro && <div className="alert danger"><span className="lead">Erro:</span><span>{erro}</span></div>}
      {ok && <div className="alert success"><span className="lead">OK:</span><span>{ok}</span></div>}

      {!ehMei && (
        <div className="erp-card" style={{ marginBottom: 16 }}>
          <div className="erp-card-head"><h3>Enquadramento (confirme com o contador)</h3></div>
          <div className="erp-form">
            <label className="full">
              Anexo do Simples
              <select value={anexo} onChange={(e) => setAnexo(e.target.value)}>
                <option value="">— usar sugestão pelo tipo do negócio —</option>
                {ANEXOS_OPCOES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
            <label>
              Folha mensal média (R$) — Fator R
              <input type="number" min="0" step="0.01" value={folha} onChange={(e) => setFolha(e.target.value)} placeholder="Salários + pró-labore + encargos" />
            </label>
            <label style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="button" className="btn-erp primary sm" disabled={busy} onClick={salvarConfig}>Salvar enquadramento</button>
            </label>
          </div>
        </div>
      )}

      {dados && (
        <>
          {dados.alertas.map((a, i) => (
            <div key={i} className="alert warn" style={{ marginBottom: 8 }}><span className="lead">⚠</span><span>{a}</span></div>
          ))}

          {ehMei && dados.mei ? (
            <>
              <div className="kpi-row">
                <div className="kpi"><span className="kpi-label">Receita do mês</span><strong>{brl(dados.receitaMes)}</strong></div>
                <div className="kpi"><span className="kpi-label">Acumulado no ano</span><strong>{brl(dados.mei.acumuladoAno)}</strong></div>
                <div className="kpi"><span className="kpi-label">Limite MEI</span><strong>{brl(dados.mei.limite)}</strong></div>
                <div className="kpi"><span className="kpi-label">Consumido</span><strong style={{ color: dados.mei.percentualConsumido >= 80 ? "#c62828" : undefined }}>{dados.mei.percentualConsumido.toFixed(1)}%</strong></div>
                <div className="kpi"><span className="kpi-label">Projeção do ano</span><strong style={{ color: dados.mei.projecaoAnual > dados.mei.limite ? "#c62828" : undefined }}>{brl(dados.mei.projecaoAnual)}</strong></div>
              </div>
              <div style={{ margin: "12px 0", height: 14, background: "var(--erp-bg, #eee)", borderRadius: 7, overflow: "hidden", border: "1px solid var(--erp-line)" }}>
                <div style={{ width: `${Math.min(100, dados.mei.percentualConsumido)}%`, height: "100%", background: dados.mei.percentualConsumido >= 80 ? "#c62828" : "var(--erp-yellow, #f2b705)" }} />
              </div>
            </>
          ) : (
            <>
              <div className="kpi-row">
                <div className="kpi"><span className="kpi-label">Receita do mês</span><strong>{brl(dados.receitaMes)}</strong></div>
                <div className="kpi"><span className="kpi-label">RBT12{dados.rbt12Proporcionalizado ? " (proporcional)" : ""}</span><strong>{brl(dados.rbt12)}</strong></div>
                <div className="kpi"><span className="kpi-label">Faixa / alíq. efetiva</span><strong>{dados.faixa}ª · {dados.aliquotaEfetiva.toFixed(2)}%</strong></div>
                <div className="kpi"><span className="kpi-label">DAS sem segregação</span><strong>{brl(dados.dasSemSegregacao)}</strong></div>
                <div className="kpi"><span className="kpi-label">DAS COM segregação</span><strong>{brl(dados.dasComSegregacao)}</strong></div>
                <div className="kpi" style={dados.economiaSegregacao > 0 ? { outline: "2px solid var(--erp-yellow, #f2b705)" } : undefined}>
                  <span className="kpi-label">💰 Economia no mês</span><strong style={{ color: "#1b5e20" }}>{brl(dados.economiaSegregacao)}</strong>
                </div>
              </div>

              <div className="erp-card" style={{ marginTop: 12 }}>
                <div className="erp-card-head"><h3>Segregação de receitas — {dados.anexoNome} ({dados.competencia})</h3></div>
                <div className="erp-table-wrap">
                  <table className="erp-table">
                    <thead><tr><th>Tipo de receita</th><th className="num">Valor</th><th>Tratamento no DAS</th></tr></thead>
                    <tbody>
                      <tr><td>Revenda comum</td><td className="num">{brl(dados.receitaNormal)}</td><td>Tributação integral</td></tr>
                      <tr>
                        <td><strong>Monofásico</strong> (autopeças, bebidas, medicamentos, perfumaria...)</td>
                        <td className="num"><strong>{brl(dados.receitaMonofasica)}</strong></td>
                        <td>PIS e COFINS <strong>excluídos</strong> (já pagos pela indústria)</td>
                      </tr>
                      <tr>
                        <td><strong>ICMS-ST</strong> (substituição tributária)</td>
                        <td className="num"><strong>{brl(dados.receitaSt)}</strong></td>
                        <td>ICMS <strong>excluído</strong> (retido na compra)</td>
                      </tr>
                      <tr>
                        <td><strong>Monofásico + ST</strong></td>
                        <td className="num"><strong>{brl(dados.receitaMonofasicaSt)}</strong></td>
                        <td>PIS, COFINS e ICMS <strong>excluídos</strong></td>
                      </tr>
                      <tr><td>Serviços</td><td className="num">{brl(dados.receitaServicos)}</td><td>Conforme anexo de serviços</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="erp-card" style={{ marginTop: 12 }}>
                <div className="erp-card-head"><h3>Partilha do DAS por tributo (alíquota efetiva {dados.aliquotaEfetiva.toFixed(2)}%)</h3></div>
                <div className="erp-table-wrap">
                  <table className="erp-table">
                    <thead><tr><th>Tributo</th><th className="num">% na partilha</th><th className="num">Alíq. efetiva</th><th className="num">Sem segregação</th><th className="num">Com segregação</th></tr></thead>
                    <tbody>
                      {dados.partilha.map((p) => (
                        <tr key={p.tributo}>
                          <td><strong>{p.tributo}</strong></td>
                          <td className="num">{p.percentual.toFixed(2)}%</td>
                          <td className="num">{p.aliquotaEfetiva.toFixed(4)}%</td>
                          <td className="num">{brl(p.valorSemSegregacao)}</td>
                          <td className="num" style={p.valorComSegregacao < p.valorSemSegregacao ? { color: "#1b5e20", fontWeight: 600 } : undefined}>{brl(p.valorComSegregacao)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 700 }}>
                        <td>TOTAL (DAS estimado)</td><td /><td className="num">{dados.aliquotaEfetiva.toFixed(2)}%</td>
                        <td className="num">{brl(dados.dasSemSegregacao)}</td>
                        <td className="num" style={{ color: "#1b5e20" }}>{brl(dados.dasComSegregacao)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {dados.fatorR != null && (
                  <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--erp-slate)" }}>
                    Fator R: <strong>{dados.fatorR.toFixed(1)}%</strong> {dados.fatorRAtingido ? "(≥ 28% — serviços podem apurar pelo Anexo III)" : "(< 28%)"}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="erp-card" style={{ marginTop: 12 }}>
            <div className="erp-card-head"><h3>Receita bruta dos últimos 12 meses (RBT12)</h3></div>
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead><tr><th>Competência</th><th className="num">Receita</th></tr></thead>
                <tbody>
                  {dados.meses.map((m) => (
                    <tr key={m.competencia}><td className="mono">{m.competencia}</td><td className="num">{brl(m.receita)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "var(--erp-slate)" }}>{dados.disclaimer}</div>
        </>
      )}
    </section>
  );
}
