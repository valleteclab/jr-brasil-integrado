import { QuoteForm } from "@/components/erp/QuoteForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { listQuoteFormData } from "@/lib/services/sales-quote";
import type { QuoteFormData } from "@/lib/services/sales-quote";

export const dynamic = "force-dynamic";

export default async function NovoOrcamentoPage() {
  let formData: QuoteFormData = { clientes: [], produtos: [] };
  let loadError = "";

  try {
    formData = await listQuoteFormData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar dados do formulário.";
  }

  return (
    <>
      <PageHeader eyebrow="Orçamentos" title="Novo orçamento">
        <p>Preencha os dados abaixo para criar um orçamento.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {!loadError && <QuoteForm formData={formData} />}
    </>
  );
}
