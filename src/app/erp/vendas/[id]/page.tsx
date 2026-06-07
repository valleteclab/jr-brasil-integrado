import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getSaleDetail } from "@/lib/services/sales";
import { SaleDetailActions } from "@/components/erp/SaleDetailActions";
import { VendaCalculoImposto } from "@/components/erp/VendaCalculoImposto";
import { formatBrl } from "@/lib/formatters/currency";

export const dynamic = "force-dynamic";

export default async function VendaDetalhePage({ params }: { params: { id: string } }) {
  const venda = await getSaleDetail(params.id);
  if (!venda) notFound();

  return (
    <>
      <PageHeader eyebrow="Vendas" title={`Pedido ${venda.numero}`} action={<Link className="btn-erp ghost sm" href="/erp/vendas">← Voltar</Link>}>
        <p>
          <StatusBadge tone={venda.statusTone}>{venda.statusLabel}</StatusBadge>{" "}
          {venda.canal === "LOJA" && <span className="canal-loja">🛒 Loja</span>} · Criado em {venda.criadoEm}
        </p>
      </PageHeader>

      <SaleDetailActions
        id={venda.id}
        numero={venda.numero}
        canConfirm={venda.canConfirm}
        canInvoice={venda.canInvoice}
        canCancel={venda.canCancel}
        temNotaAutorizada={venda.temNotaAutorizada}
      />

      <section className="erp-card">
        <div className="erp-card-head"><div><h3>Cliente e condições</h3></div></div>
        <div className="erp-form">
          <label>Cliente<input readOnly value={venda.clienteNome} /></label>
          <label>Documento<input readOnly value={venda.clienteDocumento ?? "—"} /></label>
          <label>Canal<input readOnly value={venda.canal} /></label>
          <label>Forma de pagamento<input readOnly value={venda.formaPagamento ?? "—"} /></label>
          <label>Condição de pagamento<input readOnly value={venda.condicaoPagamento ?? "—"} /></label>
          {venda.observacoes && <label className="full">Observações<textarea readOnly rows={2} value={venda.observacoes} /></label>}
        </div>
      </section>

      <section className="erp-card">
        <div className="erp-card-head"><div><h3>Itens ({venda.itens.length})</h3></div></div>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>SKU</th><th>Produto</th><th className="num">Qtd</th><th className="num">Preço</th><th className="num">Desc.</th><th className="num">Total</th></tr></thead>
            <tbody>
              {venda.itens.map((i) => (
                <tr key={i.id}>
                  <td className="mono">{i.produtoSku}</td>
                  <td>{i.produtoNome}</td>
                  <td className="num">{i.quantidade}</td>
                  <td className="num">{formatBrl(i.precoUnitario)}</td>
                  <td className="num">{i.desconto ? formatBrl(i.desconto) : "—"}</td>
                  <td className="num">{formatBrl(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="erp-table-foot">
            <span>Subtotal {formatBrl(venda.subtotal)} · Desconto {formatBrl(venda.desconto)} · Frete {formatBrl(venda.frete)}</span>
            <strong>Total: {formatBrl(venda.totalNumber)}</strong>
          </div>
        </div>
      </section>

      <VendaCalculoImposto id={venda.id} />

      {venda.notas.length > 0 && (
        <section className="erp-card">
          <div className="erp-card-head"><div><h3>Notas fiscais</h3></div></div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead><tr><th>Número</th><th>Modelo</th><th>Situação</th><th className="num">Total</th><th>Emitida</th></tr></thead>
              <tbody>
                {venda.notas.map((n) => (
                  <tr key={n.id}>
                    <td className="mono">{n.numero ?? "—"}</td>
                    <td>{n.modelo}</td>
                    <td>{n.status}</td>
                    <td className="num">{formatBrl(n.total)}</td>
                    <td>{n.emitidaEm ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
