import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { getSaleDetail, listSaleFormData } from "@/lib/services/sales";
import { SaleEditWorkspace } from "@/components/erp/SaleEditWorkspace";

export const dynamic = "force-dynamic";

export default async function EditarVendaPage({ params }: { params: { id: string } }) {
  const [venda, form] = await Promise.all([getSaleDetail(params.id), listSaleFormData()]);
  if (!venda) notFound();

  // Edição permitida enquanto não pago/faturado: pré-venda no caixa (AGUARDANDO_PAGAMENTO) ou
  // confirmado aguardando a nota (AGUARDANDO_NOTA), sempre sem nota autorizada vinculada.
  const editavel = venda.status === "AGUARDANDO_NOTA" || venda.status === "AGUARDANDO_PAGAMENTO";
  if (!editavel || venda.temNotaAutorizada) {
    redirect(`/erp/vendas/${params.id}`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title={`Editar pedido ${venda.numero}`}
        action={<Link className="btn-erp ghost sm" href={`/erp/vendas/${venda.id}`}>← Voltar</Link>}
      >
        <p className="block-muted">
          Ajuste itens e condições antes de emitir a nota. Ao salvar, o estoque e o contas a receber são reajustados automaticamente.
        </p>
      </PageHeader>
      <SaleEditWorkspace venda={venda} form={form} />
    </>
  );
}
