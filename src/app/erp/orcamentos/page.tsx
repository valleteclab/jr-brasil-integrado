import { QuotesList } from "@/components/erp/QuotesList";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { listQuotes } from "@/lib/services/sales-quote";
import type { QuoteSummary } from "@/lib/services/sales-quote";

export const dynamic = "force-dynamic";

export default async function OrcamentosPage() {
  let quotes: QuoteSummary[] = [];
  let loadError = "";

  try {
    quotes = await listQuotes();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar orçamentos.";
  }

  const total = quotes.length;
  const aprovados = quotes.filter((q) => q.status === "APROVADO").length;
  const convertidos = quotes.filter((q) => q.status === "CONVERTIDO").length;

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="Orçamentos"
        action={<Button href="/erp/orcamentos/novo" variant="primary">+ Novo orçamento</Button>}
      >
        <p>
          {total} orçamentos · {aprovados} aprovados · {convertidos} convertidos
        </p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <div className="kpi-row">
        <div className="metric">
          <span>Total</span>
          <strong>{total}</strong>
        </div>
        <div className="metric">
          <span>Aprovados</span>
          <strong>{aprovados}</strong>
        </div>
        <div className="metric">
          <span>Convertidos</span>
          <strong>{convertidos}</strong>
        </div>
        <div className="metric">
          <span>Em análise</span>
          <strong>{quotes.filter((q) => q.status === "EM_ANALISE").length}</strong>
        </div>
      </div>

      <QuotesList quotes={quotes} />
    </>
  );
}
