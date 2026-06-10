import { PageHeader } from "@/components/shared/PageHeader";
import { ExpedicaoWorkspace } from "@/components/erp/ExpedicaoWorkspace";
import {
  expedicaoHabilitada,
  listRetiradasPendentes
} from "@/domains/sales/application/expedicao-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function ExpedicaoPage() {
  const scope = await getDevelopmentTenantScope();

  if (!(await expedicaoHabilitada(scope))) {
    return (
      <>
        <PageHeader eyebrow="Operação" title="Expedição">
          <p>Balcão de retirada de mercadorias.</p>
        </PageHeader>
        <div className="alert warn">
          <span>O módulo Expedição não está habilitado para esta conta. Fale com o suporte da plataforma para liberar.</span>
        </div>
      </>
    );
  }

  const pendentes = await listRetiradasPendentes(scope);

  return (
    <>
      <PageHeader eyebrow="Operação" title="Expedição">
        <p>Confira o código do recibo, valide os itens e confirme a entrega da mercadoria.</p>
      </PageHeader>
      <ExpedicaoWorkspace
        pendentes={pendentes.map((r) => ({
          id: r.id,
          codigo: r.codigo,
          status: r.status,
          pedidoNumero: r.pedidoVenda.numero,
          clienteNome: r.pedidoVenda.cliente
            ? (r.pedidoVenda.cliente.nomeFantasia ?? r.pedidoVenda.cliente.razaoSocial)
            : "Consumidor não identificado",
          qtdItens: r.pedidoVenda.itens.length,
          criadoEm: r.criadoEm.toLocaleString("pt-BR")
        }))}
      />
    </>
  );
}
