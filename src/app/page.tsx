import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";

const pillars = [
  "PDV, vendas, estoque e atendimento no mesmo lugar",
  "Emissão fiscal: NFC-e, NF-e e NFS-e integradas",
  "Compras, oficina, financeiro e fiscal conectados",
  "Expedição, crediário, comissões e relatórios"
];

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="hero">
        <div>
          <span className="eyebrow">XERP · por Valleteclab</span>
          <h1>O ERP completo para a gestão da sua empresa</h1>
          <p>
            Controle toda a operação comercial — PDV, catálogo, clientes, pedidos, estoque, oficina,
            financeiro e fiscal — em um sistema só, pensado para o varejo e os serviços brasileiros.
          </p>
          <div className="actions">
            <Button href="/erp" variant="dark">Acessar o sistema</Button>
            <Button href="/manual" variant="light">Ver o manual</Button>
          </div>
        </div>
        <div className="hero-card">
          <strong>Operação comercial conectada</strong>
          <span>PDV com caixa, crediário e expedição</span>
          <span>Emissão fiscal integrada à SEFAZ</span>
          <span>Estoque, financeiro e relatórios em tempo real</span>
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
