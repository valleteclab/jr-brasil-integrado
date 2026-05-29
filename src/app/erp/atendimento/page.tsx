import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/shared/Card";
import { Button } from "@/components/shared/Button";

export const dynamic = "force-dynamic";

export default function AtendimentoPage() {
  return (
    <>
      <PageHeader eyebrow="Operações" title="Central de Atendimento">
        <p>Selecione o tipo de atendimento para iniciar.</p>
      </PageHeader>

      <div className="kpi-row" style={{ alignItems: "stretch" }}>
        <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <h3>Nova Venda</h3>
            <p>
              Venda direta ao balcão ou online. Cria um pedido de venda, reserva estoque e
              gera a conta a receber. Ideal para vendas já fechadas onde o cliente vai embora
              com o produto.
            </p>
          </div>
          <Button href="/erp/vendas/nova" variant="primary">
            Iniciar venda
          </Button>
        </Card>

        <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <h3>Novo Orçamento</h3>
            <p>
              Proposta comercial com validade. O cliente aprova ou rejeita. Quando aprovado,
              pode ser convertido em pedido de venda com um clique, reservando estoque
              automaticamente.
            </p>
          </div>
          <Button href="/erp/orcamentos/novo" variant="primary">
            Criar orçamento
          </Button>
        </Card>

        <Card style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <h3>Nova Ordem de Serviço</h3>
            <p>
              Abertura de OS para assistência técnica. Registre o equipamento, o problema
              relatado, lance serviços e peças ao longo do atendimento. Ao finalizar, fature
              com baixa de estoque e NFS-e opcional.
            </p>
          </div>
          <Button href="/erp/os/nova" variant="primary">
            Abrir OS
          </Button>
        </Card>
      </div>

      <div className="kpi-row" style={{ marginTop: "24px" }}>
        <Card style={{ flex: 1 }}>
          <h4>Acesso rápido</h4>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px" }}>
            <Button href="/erp/orcamentos" variant="light">Ver orçamentos</Button>
            <Button href="/erp/os" variant="light">Ver ordens de serviço</Button>
            <Button href="/erp/vendas" variant="light">Ver pedidos de venda</Button>
            <Button href="/erp/financeiro" variant="light">Contas a receber</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
