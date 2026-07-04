"use client";

import { useEffect, useRef, useState } from "react";
import { formatBrl } from "@/lib/formatters/currency";

/** Espelho fiscal retornado pela API de preview (espelha FiscalPreview do domínio). */
export type FiscalPreviewItem = {
  numeroItem: number;
  codigo: string;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  origem: string;
  quantidade: number;
  valorTotal: number;
  cstIcms: string | null;
  csosn: string | null;
  baseIcms: number;
  aliquotaIcms: number;
  valorIcms: number;
  baseIcmsSt: number;
  aliquotaIcmsSt: number;
  valorIcmsSt: number;
  valorFcp: number;
  cstIpi: string | null;
  aliquotaIpi: number;
  valorIpi: number;
  cstPis: string | null;
  aliquotaPis: number;
  valorPis: number;
  cstCofins: string | null;
  aliquotaCofins: number;
  valorCofins: number;
  cClassTrib: string | null;
  baseIbsCbs: number;
  aliquotaIbs: number;
  valorIbs: number;
  aliquotaCbs: number;
  valorCbs: number;
  aliquotaIs: number;
  valorIs: number;
  valorTributos: number;
  /** Nome da regra tributária aplicada (null se caiu no padrão nacional). */
  regraNome?: string | null;
  /** false = nenhuma regra específica bateu — cálculo pelo padrão nacional (regime/UF). */
  regraAplicada?: boolean;
};

export type FiscalPreviewTotais = {
  valorProdutos: number;
  valorServicos: number;
  valorDesconto: number;
  valorFrete: number;
  valorSeguro: number;
  outrasDespesas: number;
  valorIcms: number;
  valorIcmsSt: number;
  valorFcp: number;
  valorIpi: number;
  valorPis: number;
  valorCofins: number;
  valorIss: number;
  valorIbs: number;
  valorCbs: number;
  valorIs: number;
  valorTotalTributos: number;
  total: number;
};

export type FiscalPreview = {
  modelo: string;
  regime: string;
  serie: string;
  naturezaOperacao: string;
  destinatarioNome: string;
  itens: FiscalPreviewItem[];
  totais: FiscalPreviewTotais;
  avisos: string[];
};

const MODELO_LABEL: Record<string, string> = { NFE: "NF-e (mod. 55)", NFCE: "NFC-e (mod. 65)", NFSE: "NFS-e" };

function pct(v: number) {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Soma as bases de ICMS dos itens (a base de ICMS-ST vem por item também). */
function somaBase(itens: FiscalPreviewItem[], campo: "baseIcms" | "baseIcmsSt") {
  return itens.reduce((acc, i) => acc + (i[campo] || 0), 0);
}

/** Grade de totalizadores no formato Bling — reutilizada pelo modal e pelo painel inline. */
export function EspelhoTotaisGrid({ preview }: { preview: FiscalPreview }) {
  const t = preview.totais;
  const baseIcms = somaBase(preview.itens, "baseIcms");
  const baseIcmsSt = somaBase(preview.itens, "baseIcmsSt");
  const totalFaturado = t.total;

  const boxes: { label: string; value: number; tone?: "muted" | "reforma" }[] = [
    { label: "Total dos Produtos", value: t.valorProdutos },
    { label: "Valor do Frete", value: t.valorFrete },
    { label: "Valor do Seguro", value: t.valorSeguro },
    { label: "Outras Despesas", value: t.outrasDespesas },
    { label: "Desconto", value: t.valorDesconto },
    { label: "Total da Nota", value: t.total },
    { label: "Base ICMS", value: baseIcms },
    { label: "Valor ICMS", value: t.valorIcms },
    { label: "Base ICMS ST", value: baseIcmsSt },
    { label: "Valor ICMS ST", value: t.valorIcmsSt },
    { label: "Valor IPI", value: t.valorIpi },
    { label: "Valor FCP", value: t.valorFcp },
    { label: "Valor PIS", value: t.valorPis },
    { label: "Valor COFINS", value: t.valorCofins },
    { label: "Total IS", value: t.valorIs, tone: "reforma" },
    { label: "Total IBS", value: t.valorIbs, tone: "reforma" },
    { label: "Total CBS", value: t.valorCbs, tone: "reforma" },
    { label: "Total dos Serviços", value: t.valorServicos },
    { label: "Valor ISSQN", value: t.valorIss },
    { label: "Total Faturado", value: totalFaturado },
    { label: "Total Aprox. Tributos", value: t.valorTotalTributos, tone: "muted" }
  ];

  return (
    <div className="calc-grid">
      {boxes.map((b) => (
        <div key={b.label} className={`calc-box${b.tone ? ` ${b.tone}` : ""}`}>
          <span className="calc-box-label">{b.label}</span>
          <strong className="calc-box-value">{formatBrl(b.value)}</strong>
        </div>
      ))}
    </div>
  );
}

/** Tabela do espelho (tributos por item) + grade de totalizadores. */
export function EspelhoFiscalTabela({ preview }: { preview: FiscalPreview }) {
  return (
    <div className="espelho-fiscal">
      <div className="espelho-meta">
        <span><b>{MODELO_LABEL[preview.modelo] ?? preview.modelo}</b></span>
        <span>Série {preview.serie || "—"}</span>
        <span>Regime: {preview.regime}</span>
        <span>Natureza: {preview.naturezaOperacao}</span>
        <span>Destinatário: {preview.destinatarioNome || "—"}</span>
      </div>

      {preview.avisos.length > 0 && (
        <div className="alert warn espelho-avisos">
          <strong>Pendências para emitir</strong>
          <ul>
            {preview.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="erp-table-wrap">
        <table className="erp-table espelho-tabela">
          <thead>
            <tr>
              <th>Item</th>
              <th>NCM</th>
              <th>CFOP</th>
              <th>CST/CSOSN</th>
              <th className="num">Base ICMS</th>
              <th className="num">Alíq. ICMS</th>
              <th className="num">ICMS</th>
              <th className="num">ICMS-ST</th>
              <th className="num">IPI</th>
              <th className="num">PIS</th>
              <th className="num">COFINS</th>
              <th className="num">IBS</th>
              <th className="num">CBS</th>
              <th className="num">IS</th>
            </tr>
          </thead>
          <tbody>
            {preview.itens.map((i) => (
              <tr key={i.numeroItem}>
                <td>
                  <div className="espelho-item-nome">{i.numeroItem}. {i.descricao}</div>
                  <div className="espelho-item-sub">{formatBrl(i.valorTotal)} · qtd {i.quantidade}{i.cClassTrib ? ` · cClassTrib ${i.cClassTrib}` : ""}</div>
                  <div className="espelho-item-sub" style={{ color: i.regraAplicada === false ? "var(--erp-warn, #d97706)" : "var(--erp-mute, #94a3b8)" }}>
                    {i.regraAplicada === false
                      ? "⚠ sem regra específica — cálculo pelo padrão nacional (regime/UF)"
                      : i.regraNome
                        ? `Regra: ${i.regraNome}`
                        : ""}
                  </div>
                </td>
                <td className="mono">{i.ncm || "—"}</td>
                <td className="mono">{i.cfop || "—"}</td>
                <td className="mono">{i.cstIcms ?? i.csosn ?? "—"}</td>
                <td className="num">{formatBrl(i.baseIcms)}</td>
                <td className="num">{pct(i.aliquotaIcms)}</td>
                <td className="num">{formatBrl(i.valorIcms)}</td>
                <td className="num">{i.valorIcmsSt ? formatBrl(i.valorIcmsSt) : "—"}</td>
                <td className="num">{i.valorIpi ? formatBrl(i.valorIpi) : "—"}</td>
                <td className="num">{formatBrl(i.valorPis)}</td>
                <td className="num">{formatBrl(i.valorCofins)}</td>
                <td className="num">{i.valorIbs ? formatBrl(i.valorIbs) : "—"}</td>
                <td className="num">{i.valorCbs ? formatBrl(i.valorCbs) : "—"}</td>
                <td className="num">{i.valorIs ? formatBrl(i.valorIs) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="espelho-sub">Cálculo de imposto</h4>
      <EspelhoTotaisGrid preview={preview} />
      <p className="espelho-reforma-nota">
        IS, IBS e CBS são da Reforma Tributária (alíquotas de teste 2026) — exibidos para conferência;
        ainda não enviados no XML.
      </p>
    </div>
  );
}

/** Modal que envolve a tabela do espelho fiscal. */
export function EspelhoFiscalModal({
  preview,
  onClose,
  title = "Espelho fiscal — prévia da nota"
}: {
  preview: FiscalPreview;
  onClose: () => void;
  title?: string;
}) {
  return (
    <div className="drawer-bd" style={{ display: "grid", placeItems: "center", zIndex: 70 }} onClick={onClose} role="presentation">
      <div className="espelho-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="espelho-modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn-erp ghost xs icon-only" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="espelho-modal-body">
          <EspelhoFiscalTabela preview={preview} />
        </div>
        <div className="espelho-modal-foot">
          <span className="block-muted">Prévia calculada com as regras tributárias/NCM da empresa. A nota só é gerada ao emitir.</span>
          <button type="button" className="btn-erp primary sm" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Painel inline "Cálculo de imposto" (formato Bling): sempre visível na tela de emissão,
 * recalcula com debounce ao mudar as entradas. Recebe um endpoint e um builder do corpo do
 * POST; `deps` dispara o recálculo. O toggle "Cálculo automático" liga/desliga o recálculo.
 */
export function CalculoImpostoPanel({
  endpoint,
  buildBody,
  deps,
  enabled = true
}: {
  endpoint: string;
  buildBody: () => Record<string, unknown> | null;
  deps: unknown[];
  enabled?: boolean;
}) {
  const [auto, setAuto] = useState(true);
  const [preview, setPreview] = useState<FiscalPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function calcular() {
    const body = buildBody();
    if (!body) {
      setPreview(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json().catch(() => ({}))) as FiscalPreview & { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível calcular os impostos.");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível calcular os impostos.");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled || !auto) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(calcular, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, enabled, ...deps]);

  return (
    <div className="erp-card calc-imposto-panel">
      <div className="erp-card-head calc-head">
        <h3>Cálculo de imposto</h3>
        <label className="calc-auto" title="Recalcular automaticamente ao alterar os itens">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>Cálculo automático {auto ? "ligado" : "desligado"}</span>
        </label>
      </div>
      {!auto && (
        <button type="button" className="btn-erp light sm" style={{ margin: "0 12px 10px" }} onClick={calcular} disabled={loading}>
          {loading ? "Calculando…" : "Calcular agora"}
        </button>
      )}
      <div className="calc-body">
        {loading && !preview && <p className="block-muted">Calculando impostos…</p>}
        {error && <div className="alert danger" style={{ margin: 0 }}><span>{error}</span></div>}
        {!loading && !error && !preview && <p className="block-muted">Adicione itens para calcular os impostos.</p>}
        {preview && (
          <>
            {preview.avisos.length > 0 && (
              <div className="alert warn" style={{ margin: "0 0 10px" }}>
                <strong>Pendências</strong>
                <ul>{preview.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}
            <EspelhoTotaisGrid preview={preview} />
          </>
        )}
      </div>
    </div>
  );
}
