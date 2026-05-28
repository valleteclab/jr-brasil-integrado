import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";

const pillars = [
  "Vendas, estoque e atendimento no mesmo lugar",
  "Pedidos online acompanhados pela equipe comercial",
  "Compras, oficina, financeiro e fiscal conectados",
  "Portal B2B com pedidos, orçamentos e documentos"
];

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="hero">
        <div>
          <span className="eyebrow">JR Brasil Peças & Serviços</span>
          <h1>Gestão integrada para peças, serviços e vendas B2B</h1>
          <p>
            Controle a operação comercial da JR Brasil com catálogo, clientes, pedidos, estoque, oficina e financeiro em uma experiência única.
          </p>
          <div className="actions">
            <Button href="/loja">Abrir loja B2B</Button>
            <Button href="/erp" variant="dark">Acessar gestão</Button>
          </div>
        </div>
        <div className="hero-card">
          <strong>Operação comercial conectada</strong>
          <span>Catálogo técnico para peças e serviços</span>
          <span>Atendimento rápido para clientes B2B</span>
          <span>Gestão de pedidos, estoque e orçamentos</span>
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
