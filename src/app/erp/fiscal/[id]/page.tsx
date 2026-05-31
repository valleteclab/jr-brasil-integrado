import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { NotaFiscalActions } from "@/components/erp/NotaFiscalActions";
import { getNotaFiscalDetalhe, type NotaFiscalItemDetalhe } from "@/lib/services/fiscal";

export const dynamic = "force-dynamic";

export default async function NotaFiscalDetalhePage({ params }: { params: { id: string } }) {
  const nota = await getNotaFiscalDetalhe(params.id);
  if (!nota) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Financeiro & Fiscal"
        title={`${nota.modeloLabel} ${nota.numero}${nota.finalidadeLabel ? ` · ${nota.finalidadeLabel}` : ""}`}
        action={<Link className="btn-erp light sm" href="/erp/fiscal">← Voltar</Link>}
      >
        <p>Série {nota.serie} · {nota.ambiente} · emitida em {nota.emitidaEm}</p>
      </PageHeader>

      <div className="erp-card">
        <div className="erp-card-head">
          <h3>Situação</h3>
          <span className={`pill ${nota.statusTone}`}><span className="dot" />{nota.statusLabel}</span>
        </div>
        <div className="erp-form">
          <label>Chave de acesso<input value={nota.chaveAcesso || "—"} readOnly /></label>
          {nota.chaveReferenciada && <label>Nota referenciada (devolução)<input value={nota.chaveReferenciada} readOnly /></label>}
          <label>Protocolo<input value={nota.protocolo || "—"} readOnly /></label>
          <label>Autorizada em<input value={nota.autorizadaEm} readOnly /></label>
          {nota.canceladaEm !== "—" && <label>Cancelada em<input value={nota.canceladaEm} readOnly /></label>}
        </div>
        {nota.motivo && (
          <div className="alert info" style={{ margin: "0 16px 16px" }}>
            <strong>Mensagem do fisco</strong><span>{nota.motivo}</span>
          </div>
        )}
      </div>

      <NotaFiscalActions
        id={nota.id}
        modeloLabel={nota.modeloLabel}
        numero={nota.numero}
        canCancel={nota.canCancel}
        canCorrect={nota.canCorrect}
        canDownload={nota.canDownload}
        canSync={nota.canSync}
        canClone={nota.canClone}
        canDevolver={nota.canDevolver}
      />

      <div className="erp-card">
        <div className="erp-card-head"><h3>Destinatário</h3></div>
        <div className="erp-form">
          <label>Nome / Razão social<input value={nota.destinatario} readOnly /></label>
          <label>CPF / CNPJ<input value={nota.destinatarioDocumento || "—"} readOnly /></label>
          <label>E-mail<input value={nota.destinatarioEmail || "—"} readOnly /></label>
          <label>Natureza da operação<input value={nota.naturezaOperacao} readOnly /></label>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-head"><h3>Itens</h3></div>
        <div className="erp-table-wrap solo">
          <table className="erp-table">
            <thead>
              <tr>
                <th>#</th><th>Código</th><th>Descrição</th><th>NCM</th><th>CFOP</th>
                <th>Un.</th><th className="num">Qtd</th><th className="num">Vlr un.</th><th className="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {nota.itens.map((it: NotaFiscalItemDetalhe) => (
                <tr key={it.numeroItem}>
                  <td>{it.numeroItem}</td>
                  <td className="mono">{it.codigo || "—"}</td>
                  <td>{it.descricao}</td>
                  <td>{it.ncm || "—"}</td>
                  <td>{it.cfop || "—"}</td>
                  <td>{it.unidade}</td>
                  <td className="num">{it.quantidade}</td>
                  <td className="num">{it.valorUnitario}</td>
                  <td className="num bold">{it.valorTotal}</td>
                </tr>
              ))}
              {!nota.itens.length && (
                <tr><td colSpan={9}><div className="empty-st">Sem itens (nota de serviço ou dados não detalhados).</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="erp-card">
        <div className="erp-card-head"><h3>Totais</h3></div>
        <div className="erp-form">
          <label>Produtos<input value={nota.valorProdutos} readOnly /></label>
          <label>Serviços<input value={nota.valorServicos} readOnly /></label>
          <label>ICMS<input value={nota.valorIcms} readOnly /></label>
          <label>PIS<input value={nota.valorPis} readOnly /></label>
          <label>COFINS<input value={nota.valorCofins} readOnly /></label>
          <label>ISS<input value={nota.valorIss} readOnly /></label>
          <label>Total da nota<input value={nota.total} readOnly /></label>
        </div>
        {nota.informacoesComplementares && (
          <div className="alert info" style={{ margin: "0 16px 16px" }}>
            <strong>Informações complementares</strong><span>{nota.informacoesComplementares}</span>
          </div>
        )}
      </div>
    </>
  );
}
