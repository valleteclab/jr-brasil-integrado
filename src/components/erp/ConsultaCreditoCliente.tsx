"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Painel de crédito no cadastro do cliente: consulta o bureau (PF Boa Vista / PJ SQOD), mostra a
 * DECISÃO, score, restrições e o PDF do laudo, e sugere o limite. Cada consulta é SALVA (histórico
 * + cache 60 dias) e DEBITA a carteira de créditos. Consulta só por clique (com aviso de custo).
 */

type Normalizado = {
  produto: string;
  nome: string | null;
  score: number | null;
  faixa: string | null;
  probabilidadeInadimplencia: number | null;
  decisao: "APROVADO" | "REPROVADO" | "ANALISE" | null;
  parecer: string | null;
  limiteRecomendado: number | null;
  capacidadePagamento: number | null;
  rendaOuFaturamento: string | null;
  restricoes: { protestos: number; pendencias: number; chequesSemFundo: number; acoesJudiciais: number; total: number };
  temRestricao: boolean;
  pdfUrl: string | null;
};
type Consulta = { id: string; emCache: boolean; consultadoEm: string; custo: number; normalizado: Normalizado; vigente?: boolean };
type Avaliacao = { limite: number; emAberto: number; disponivel: number; temLimite: boolean };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const DECISAO: Record<string, { label: string; tone: string }> = {
  APROVADO: { label: "Crédito recomendado", tone: "success" },
  ANALISE: { label: "Analisar", tone: "warn" },
  REPROVADO: { label: "Não recomendado", tone: "danger" }
};

export function ConsultaCreditoCliente({
  clienteId,
  documento,
  onLimiteSugerido
}: {
  clienteId: string;
  documento: string;
  onLimiteSugerido?: (valor: number) => void;
}) {
  const [ultima, setUltima] = useState<Consulta | null>(null);
  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/erp/clientes/${clienteId}/credito`);
      const d = (await res.json().catch(() => ({}))) as { ultima?: Consulta | null; avaliacao?: Avaliacao };
      if (res.ok) { setUltima(d.ultima ?? null); setAvaliacao(d.avaliacao ?? null); }
    } catch { /* silencioso */ }
  }, [clienteId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function consultar(forcar: boolean) {
    const doc = (documento || "").replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) { setErro("Preencha um CPF ou CNPJ válido no cadastro antes de consultar."); return; }
    const tipo = doc.length === 11 ? "PF" : "PJ";
    if (!window.confirm(`Consultar o crédito ${tipo} deste cliente no bureau? Isso debita 1 consulta da sua carteira de créditos.`)) return;
    setBusy(true); setErro("");
    try {
      const res = await fetch("/api/erp/creditos/consultar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento: doc, clienteId, forcar })
      });
      const d = (await res.json().catch(() => ({}))) as Consulta & { error?: string };
      if (!res.ok) throw new Error(d.error || "Falha na consulta.");
      setUltima(d);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na consulta.");
    } finally {
      setBusy(false);
    }
  }

  const n = ultima?.normalizado;
  const dec = n?.decisao ? DECISAO[n.decisao] : null;

  return (
    <div className="erp-card" style={{ gridColumn: "1 / -1", padding: 14, marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <strong>Análise de crédito (bureau)</strong>
        <span style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn-erp primary sm" disabled={busy} onClick={() => consultar(false)}>
            {busy ? "Consultando…" : ultima ? "Consultar de novo" : "Consultar crédito"}
          </button>
          {ultima && <button type="button" className="btn-erp light sm" disabled={busy} onClick={() => consultar(true)} title="Ignora o cache e consulta de novo (novo custo)">Forçar</button>}
        </span>
      </div>

      {erro && <div className="alert danger" style={{ marginTop: 10 }}>{erro}</div>}

      {avaliacao?.temLimite && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
          <span>Limite aprovado: <strong>{brl(avaliacao.limite)}</strong></span>
          <span>Em aberto: <strong>{brl(avaliacao.emAberto)}</strong></span>
          <span>Disponível: <strong style={{ color: avaliacao.disponivel < 0 ? "#c62828" : "#1b5e20" }}>{brl(avaliacao.disponivel)}</strong></span>
        </div>
      )}

      {!ultima && !erro && <div className="block-muted" style={{ marginTop: 10, fontSize: 13 }}>Nenhuma consulta ainda. Clique em “Consultar crédito” para avaliar este cliente.</div>}

      {n && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {dec && <span className={`pill ${dec.tone}`} style={{ fontSize: 13 }}><span className="dot" />{dec.label}</span>}
            {n.score != null && <span style={{ fontSize: 20, fontWeight: 700 }}>Score {n.score}{n.faixa ? ` · ${n.faixa}` : ""}</span>}
            {n.probabilidadeInadimplencia != null && <span className="block-muted">Inadimplência {n.probabilidadeInadimplencia}%</span>}
            {n.capacidadePagamento != null && <span className="block-muted">Capacidade pagto {n.capacidadePagamento}%</span>}
          </div>

          {n.parecer && <div style={{ fontSize: 13 }}><strong>Parecer:</strong> {n.parecer}</div>}
          {n.rendaOuFaturamento && <div style={{ fontSize: 13 }}><strong>Renda/faturamento:</strong> {n.rendaOuFaturamento}</div>}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
            <span className={n.restricoes.total ? "pill danger" : "pill success"} style={{ fontSize: 12 }}>
              <span className="dot" />{n.restricoes.total ? `${n.restricoes.total} restrição(ões)` : "Sem restrições"}
            </span>
            {n.restricoes.protestos > 0 && <span>Protestos: {n.restricoes.protestos}</span>}
            {n.restricoes.pendencias > 0 && <span>Pendências: {n.restricoes.pendencias}</span>}
            {n.restricoes.chequesSemFundo > 0 && <span>Cheques s/ fundo: {n.restricoes.chequesSemFundo}</span>}
            {n.restricoes.acoesJudiciais > 0 && <span>Ações: {n.restricoes.acoesJudiciais}</span>}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
            {n.limiteRecomendado != null && (
              <>
                <span>Limite sugerido pelo bureau: <strong>{brl(n.limiteRecomendado)}</strong></span>
                {onLimiteSugerido && <button type="button" className="btn-erp light xs" onClick={() => onLimiteSugerido(n.limiteRecomendado!)}>Usar como limite aprovado</button>}
              </>
            )}
            {n.pdfUrl && <a href={n.pdfUrl} target="_blank" rel="noreferrer" className="btn-erp ghost xs">📄 Abrir laudo (PDF)</a>}
          </div>

          {ultima && (
            <small className="block-muted">
              Consultado em {new Date(ultima.consultadoEm).toLocaleString("pt-BR")} · custo {brl(ultima.custo)}
              {ultima.emCache || ultima.vigente ? " · em cache (sem novo custo)" : ""}
            </small>
          )}
        </div>
      )}
    </div>
  );
}
