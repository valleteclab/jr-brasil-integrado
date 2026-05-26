import Link from "next/link";

const categories = ["Peças Agrícolas", "Peças Automotivas", "Peças Industriais", "Serviços de oficina"];
const products = [
  { sku: "AXE72011", name: "Eixo de Acionamento John Deere", price: "R$ 4.200,00", stock: "12 un." },
  { sku: "SK-514", name: "Conjunto entre Diferenciais Scania", price: "R$ 4.800,00", stock: "3 un." },
  { sku: "JR-CRZ-440", name: "Cruzeta Cardan 44x126mm", price: "R$ 680,00", stock: "36 un." }
];

export default function StorePage() {
  return (
    <main className="store-shell">
      <header className="store-header">
        <Link href="/" className="brand-inline"><span className="brand-mark">JR</span><strong>JR Brasil</strong></Link>
        <nav>
          {categories.map((category) => <a key={category}>{category}</a>)}
        </nav>
        <Link className="button dark" href="/erp">ERP</Link>
      </header>
      <section className="store-hero">
        <span className="eyebrow">Ecommerce B2B integrado</span>
        <h1>Catálogo técnico para peças, serviços e orçamentos</h1>
        <p>Esta tela inicial substitui a base standalone e será conectada ao mesmo banco do ERP.</p>
      </section>
      <section className="grid three">
        {products.map((product) => (
          <article className="card product-card" key={product.sku}>
            <span className="sku">{product.sku}</span>
            <h2>{product.name}</h2>
            <strong>{product.price}</strong>
            <p>Estoque ERP: {product.stock}</p>
            <div className="actions compact">
              <button className="button primary">Comprar</button>
              <button className="button light">Orçar</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
