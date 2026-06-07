"use client";

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
  valorTributos: number;
};

export type FiscalPreview = {
  modelo: string;
  regime: string;
  serie: string;
  naturezaOperacao: string;
  destinatarioNome: string;
  itens: FiscalPreviewItem[];
  totais: {
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
    valorTotalTributos: number;
    total: number;
  };
  avisos: string[];
};

const MODELO_LABEL: Record<string, string> = { NFE: "NF-e (mod. 55)", NFCE: "NFC-e (mod. 65)", NFSE: "NFS-e" };

function pct(v: number) {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Tabela do espelho (tributos por item + totais). Use dentro de uma seção/card ou do modal. */
export function EspelhoFiscalTabela({ preview }: { preview: FiscalPreview }) {
  const t = preview.totais;
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
              <th className="num">Trib. aprox.</th>
            </tr>
          </thead>
          <tbody>
            {preview.itens.map((i) => (
              <tr key={i.numeroItem}>
                <td>
                  <div className="espelho-item-nome">{i.numeroItem}. {i.descricao}</div>
                  <div className="espelho-item-sub">{formatBrl(i.valorTotal)} · qtd {i.quantidade}</div>
                </td>
                <td className="mono">{i.ncm || "—"}</td>
                <td className="mono">{i.cfop || "—"}</td>
                <td className="mono">{i.cstIcms ?? i.csosn ?? "—"}</td>
                <td className="num">{formatBrl(i.baseIcms)}</td>
                <td className="num">{pct(i.aliquotaIcms)}</td>
                <td className="num">{formatBrl(i.valorIcms)}</td>
                <td className="num">{i.valorIcmsSt ? formatBrl(i.valorIcmsSt) : "—"}</td>
                <td className="num">{i.valorIpi ? `${formatBrl(i.valorIpi)}` : "—"}</td>
                <td className="num">{formatBrl(i.valorPis)}</td>
                <td className="num">{formatBrl(i.valorCofins)}</td>
                <td className="num">{formatBrl(i.valorTributos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="espelho-totais">
        <div><span>Produtos</span><strong>{formatBrl(t.valorProdutos)}</strong></div>
        {t.valorServicos > 0 && <div><span>Serviços</span><strong>{formatBrl(t.valorServicos)}</strong></div>}
        <div><span>Desconto</span><strong>{formatBrl(t.valorDesconto)}</strong></div>
        {t.valorFrete > 0 && <div><span>Frete</span><strong>{formatBrl(t.valorFrete)}</strong></div>}
        <div><span>ICMS</span><strong>{formatBrl(t.valorIcms)}</strong></div>
        {t.valorIcmsSt > 0 && <div><span>ICMS-ST</span><strong>{formatBrl(t.valorIcmsSt)}</strong></div>}
        {t.valorFcp > 0 && <div><span>FCP</span><strong>{formatBrl(t.valorFcp)}</strong></div>}
        {t.valorIpi > 0 && <div><span>IPI</span><strong>{formatBrl(t.valorIpi)}</strong></div>}
        <div><span>PIS</span><strong>{formatBrl(t.valorPis)}</strong></div>
        <div><span>COFINS</span><strong>{formatBrl(t.valorCofins)}</strong></div>
        {t.valorIss > 0 && <div><span>ISS</span><strong>{formatBrl(t.valorIss)}</strong></div>}
        <div className="espelho-trib"><span>Tributos aprox. (Lei 12.741)</span><strong>{formatBrl(t.valorTotalTributos)}</strong></div>
        <div className="espelho-grand"><span>Total da nota</span><strong>{formatBrl(t.total)}</strong></div>
      </div>
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
