import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";

const kpis = [
  ["Faturamento 30d", "R$ 287,4k", "success"],
  ["Pedidos no mês", "142", "info"],
  ["OS abertas", "5", "default"],
  ["Estoque crítico", "8 SKUs", "warn"]
] as const;

export default function ErpPage() {
  return (
    <>
      <PageHeader
        eyebrow="Backoffice integrado"
        title="Dashboard operacional"
        action={<Button href="/loja">Ver loja</Button>}
      />
      <div className="grid four">
        {kpis.map(([label, value, tone]) => (
          <KpiCard key={label} label={label} value={value} tone={tone} />
        ))}
      </div>
      <section className="panel">
        <h2>Rotinas em destaque</h2>
        <div className="grid three">
          <Card>Acompanhar pedidos em aberto e pendências de separação.</Card>
          <Card>Revisar orçamentos aguardando resposta do cliente.</Card>
          <Card>Monitorar produtos com estoque crítico antes da venda.</Card>
        </div>
      </section>
    </>
  );
}
