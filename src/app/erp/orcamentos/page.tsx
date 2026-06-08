import { QuotesList } from "@/components/erp/QuotesList";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { KpiCard } from "@/components/shared/KpiCard";
import { listQuotes } from "@/lib/services/sales-quote";
import type { QuoteSummary } from "@/lib/services/sales-quote";
import { getSession } from "@/lib/auth/session";
import { isAdminPerfil } from "@/lib/auth/modules";

export const dynamic = "force-dynamic";

export default async function OrcamentosPage() {
  let quotes: QuoteSummary[] = [];
  let loadError = "";

  try {
    quotes = await listQuotes();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar orçamentos.";
  }

  const session = await getSession();
  const isAdmin = isAdminPerfil(session?.perfilNome ?? "");

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
        <KpiCard label="Total" value={String(total)} />
        <KpiCard label="Aprovados" value={String(aprovados)} tone="success" />
        <KpiCard label="Convertidos" value={String(convertidos)} tone="info" />
        <KpiCard
          label="Em análise"
          value={String(quotes.filter((q) => q.status === "EM_ANALISE").length)}
          tone="warn"
        />
      </div>

      <QuotesList quotes={quotes} isAdmin={isAdmin} />
    </>
  );
}
