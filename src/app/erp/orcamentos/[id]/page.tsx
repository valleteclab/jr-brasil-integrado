import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getQuoteDetail } from "@/lib/services/sales-quote";
import { QuoteDetailActions } from "@/components/erp/QuoteDetailActions";

export const dynamic = "force-dynamic";

export default async function OrcamentoDetalhePage({ params }: { params: { id: string } }) {
  const orc = await getQuoteDetail(params.id);
  if (!orc) notFound();

  return (
    <>
      <PageHeader eyebrow="Orçamentos" title={`Orçamento ${orc.numero}`} action={<Link className="btn-erp ghost sm" href="/erp/orcamentos">← Voltar</Link>}>
        <p>
          <StatusBadge tone={orc.statusTone}>{orc.statusLabel}</StatusBadge>{" "}
          {orc.canal === "LOJA" && <span className="canal-loja">🛒 Loja</span>} · Criado em {orc.criadoEm}
          {orc.validoAte && <> · Válido até {orc.validoAte}</>}
        </p>
      </PageHeader>

      <QuoteDetailActions
        id={orc.id}
        numero={orc.numero}
        canAprovar={orc.canAprovar}
        canConverter={orc.canConverter}
        canRejeitar={orc.canRejeitar}
      />

      <section className="erp-card">
        <div className="erp-card-head"><div><h3>Cliente e condições</h3></div></div>
        <div className="erp-form">
          <label>Cliente<input readOnly value={orc.cliente} /></label>
          <label>Vendedor<input readOnly value={orc.vendedor || "—"} /></label>
          <label>Condição de pagamento<input readOnly value={orc.condicaoPagamento || "—"} /></label>
          <label>Canal<input readOnly value={orc.canal} /></label>
          {orc.observacaoVendedor && <label className="full">Observações<textarea readOnly rows={2} value={orc.observacaoVendedor} /></label>}
        </div>
      </section>

      <section className="erp-card">
        <div className="erp-card-head"><div><h3>Itens ({orc.itens.length})</h3></div></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>SKU</th><th>Produto</th><th className="num">Qtd</th><th className="num">Preço</th><th className="num">Total</th></tr></thead>
            <tbody>
              {orc.itens.map((i) => (
                <tr key={i.id}>
                  <td className="mono">{i.produtoSku}</td>
                  <td>{i.produtoNome}</td>
                  <td className="num">{i.quantidade}</td>
                  <td className="num">{i.precoUnitario}</td>
                  <td className="num">{i.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="erp-table-foot">
            <span>Subtotal {orc.subtotal} · Desconto {orc.desconto}</span>
            <strong>Total: {orc.total}</strong>
          </div>
        </div>
      </section>
    </>
  );
}
