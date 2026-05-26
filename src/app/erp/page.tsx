const modules = [
  { group: "Operação", items: ["Dashboard", "Novo atendimento", "Vendas", "Orçamentos", "Ordens de Serviço"] },
  { group: "Suprimentos", items: ["Compras", "Estoque", "Fornecedores"] },
  { group: "Cadastros", items: ["Produtos", "Clientes", "Colaboradores"] },
  { group: "Financeiro & Fiscal", items: ["Contas a pagar/receber", "Fluxo de caixa", "NF-e"] },
  { group: "Análises", items: ["Relatórios", "Curva ABC", "DRE simplificado"] }
];

const kpis = [
  ["Faturamento 30d", "R$ 287,4k"],
  ["Pedidos no mês", "142"],
  ["OS abertas", "5"],
  ["Estoque crítico", "8 SKUs"]
];

export default function ErpPage() {
  return (
    <main className="erp-shell">
      <aside className="erp-sidebar">
        <div className="brand-mark">JR</div>
        <strong>JR Brasil ERP</strong>
        {modules.map((module) => (
          <nav key={module.group}>
            <span>{module.group}</span>
            {module.items.map((item) => <a key={item}>{item}</a>)}
          </nav>
        ))}
      </aside>
      <section className="erp-content">
        <header className="topbar-panel">
          <div>
            <span className="eyebrow">Backoffice integrado</span>
            <h1>Dashboard operacional</h1>
          </div>
          <a className="button primary" href="/loja">Ver loja</a>
        </header>
        <div className="grid four">
          {kpis.map(([label, value]) => (
            <article className="card metric" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <section className="panel">
          <h2>Próximas implementações</h2>
          <div className="grid three">
            <article className="card">Migrar componentes do protótipo ERP para módulos reais.</article>
            <article className="card">Conectar pedidos da loja ao modelo `SalesOrder`.</article>
            <article className="card">Substituir localStorage por PostgreSQL via API.</article>
          </div>
        </section>
      </section>
    </main>
  );
}
