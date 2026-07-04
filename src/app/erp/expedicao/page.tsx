import { PageHeader } from "@/components/shared/PageHeader";
import { ExpedicaoWorkspace } from "@/components/erp/ExpedicaoWorkspace";
import {
  expedicaoHabilitada,
  listRetiradasPendentes,
  listRetiradasEntreguesHoje
} from "@/domains/sales/application/expedicao-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession } from "@/lib/auth/session";

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

  const [pendentes, entreguesHoje, session] = await Promise.all([
    listRetiradasPendentes(scope),
    listRetiradasEntreguesHoje(scope),
    getSession()
  ]);

  const nomeCliente = (c: { razaoSocial: string; nomeFantasia: string | null } | null) =>
    c ? (c.nomeFantasia ?? c.razaoSocial) : "Consumidor não identificado";

  return (
    <>
      <PageHeader eyebrow="Operação" title="Expedição">
        <p>Confira o código do recibo, valide os itens e confirme a entrega da mercadoria.</p>
      </PageHeader>
      <ExpedicaoWorkspace
        conferenteNome={session?.nome ?? ""}
        pendentes={pendentes.map((r) => ({
          id: r.id,
          codigo: r.codigo,
          status: r.status,
          pedidoNumero: r.pedidoVenda.numero,
          clienteNome: nomeCliente(r.pedidoVenda.cliente),
          qtdItens: r.pedidoVenda.itens.length,
          criadoEm: r.criadoEm.toLocaleString("pt-BR")
        }))}
        entreguesHoje={entreguesHoje.map((r) => ({
          id: r.id,
          codigo: r.codigo,
          status: r.status,
          pedidoNumero: r.pedidoVenda.numero,
          clienteNome: nomeCliente(r.pedidoVenda.cliente),
          conferente: r.entreguePor ?? "—",
          entregueEm: r.entregueEm ? r.entregueEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"
        }))}
      />
    </>
  );
}
