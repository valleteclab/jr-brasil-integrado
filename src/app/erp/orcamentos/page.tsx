import { QuotesList } from "@/components/erp/QuotesList";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { KpiCard } from "@/components/shared/KpiCard";
import { listQuotes } from "@/lib/services/sales-quote";
import type { QuoteSummary } from "@/lib/services/sales-quote";
import { getSession } from "@/lib/auth/session";
import { isAdminPerfil } from "@/lib/auth/modules";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function OrcamentosPage() {
  if (!(await moduloLiberadoNoScope("orcamentoHabilitado"))) return <ModuloBloqueado titulo="Orçamentos indisponível" />;

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

  // Valores em R$ por situação (parse do total formatado — "R$ 1.234,56").
  const valorDe = (lista: QuoteSummary[]) =>
    lista.reduce((s, q) => s + (Number(q.total.replace(/[^\d,]/g, "").replace(",", ".")) || 0), 0);
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const emAnalise = quotes.filter((q) => q.status === "EM_ANALISE");
  const valorEmAnalise = valorDe(emAnalise);
  const valorAprovados = valorDe(quotes.filter((q) => q.status === "APROVADO"));
  const valorCarteira = valorEmAnalise + valorAprovados;

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
        <KpiCard label={`Em análise (${emAnalise.length})`} value={brl(valorEmAnalise)} tone="warn" />
        <KpiCard label={`Aprovados (${aprovados})`} value={brl(valorAprovados)} tone="success" />
        <KpiCard label="Carteira aberta" value={brl(valorCarteira)} tone="info" />
        <KpiCard label={`Convertidos (${convertidos})`} value={`${total} no total`} />
      </div>

      <QuotesList quotes={quotes} isAdmin={isAdmin} />
    </>
  );
}
