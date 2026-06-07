import { TaxRulesCrud } from "@/components/erp/TaxRulesCrud";
import { PageHeader } from "@/components/shared/PageHeader";
import { listTaxRules } from "@/lib/services/tax-rules";
import type { TaxRuleSummary } from "@/lib/services/tax-rules";
import { listCodigosFiscaisMany } from "@/lib/services/fiscal-codes";

export const dynamic = "force-dynamic";

export default async function TaxRulesPage() {
  let rules: TaxRuleSummary[] = [];
  let fiscalCodes: Awaited<ReturnType<typeof listCodigosFiscaisMany>> = {};
  let loadError = "";

  try {
    rules = await listTaxRules();
    fiscalCodes = await listCodigosFiscaisMany(["CST_ICMS", "CST_IPI", "CST_PIS", "CST_COFINS", "CSOSN", "CFOP"]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar regras tributárias.";
  }

  return (
    <>
      <PageHeader eyebrow="Financeiro & Fiscal" title="Regras tributárias">
        <p>{rules.length} regras cadastradas para cálculo e emissão fiscal.</p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <TaxRulesCrud initialRules={rules} fiscalCodes={fiscalCodes} />
    </>
  );
}
