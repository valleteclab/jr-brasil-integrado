import { PageHeader } from "@/components/shared/PageHeader";
import { CashFlowView } from "@/components/erp/CashFlowView";
import { getCashFlow } from "@/lib/services/finance";
import type { CashFlowData } from "@/lib/services/finance";

export const dynamic = "force-dynamic";

const EMPTY_DATA: CashFlowData = {
  projetado30: { label: "30 dias", dias: 30, totalEntradas: 0, totalSaidas: 0, saldo: 0 },
  projetado60: { label: "60 dias", dias: 60, totalEntradas: 0, totalSaidas: 0, saldo: 0 },
  projetado90: { label: "90 dias", dias: 90, totalEntradas: 0, totalSaidas: 0, saldo: 0 },
  realizado30: { totalCreditos: 0, totalDebitos: 0, saldo: 0 },
  dias: [],
  saldoAtualContas: 0
};

export default async function FluxoCaixaPage() {
  let cashFlow: CashFlowData = EMPTY_DATA;
  let loadError = "";

  try {
    cashFlow = await getCashFlow();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar o fluxo de caixa.";
  }

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Fluxo de Caixa">
        <p>Projeção de entradas e saídas para 30, 60 e 90 dias + realizado</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <CashFlowView data={cashFlow} />
    </>
  );
}
