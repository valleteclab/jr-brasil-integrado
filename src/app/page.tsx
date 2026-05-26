import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";

const pillars = [
  "Banco único para ERP e ecommerce",
  "Pedidos online entrando no backoffice",
  "Estoque, compras, OS, financeiro e fiscal integrados",
  "Portal B2B com pedidos, orçamentos, NF-e e boletos"
];

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="hero">
        <div>
          <span className="eyebrow">JR Brasil Peças & Serviços</span>
          <h1>Plataforma integrada ERP + ecommerce B2B</h1>
          <p>
            Base inicial da Fase 0 para transformar os protótipos standalone em um sistema real com módulos compartilhados, banco único e evolução por fases.
          </p>
          <div className="actions">
            <Button href="/loja">Abrir ecommerce B2B</Button>
            <Button href="/erp" variant="dark">Abrir ERP</Button>
          </div>
        </div>
        <div className="hero-card">
          <strong>Fase 0 em execução</strong>
          <span>Next.js + TypeScript + Prisma</span>
          <span>Schema inicial PostgreSQL</span>
          <span>Shells iniciais de loja e ERP</span>
        </div>
      </section>
      <section className="grid four">
        {pillars.map((pillar) => (
          <Card key={pillar}>{pillar}</Card>
        ))}
      </section>
    </main>
  );
}
