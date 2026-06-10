import { AtendimentoWorkspace } from "@/components/erp/AtendimentoWorkspace";
import { listSaleFormData } from "@/lib/services/sales";
import type { SaleFormData } from "@/lib/services/sales";

export const dynamic = "force-dynamic";

const TIPOS = ["VENDA_BALCAO", "PEDIDO_FATURADO", "ORCAMENTO", "OS"] as const;
type Tipo = (typeof TIPOS)[number];

function resolveTipo(value?: string): Tipo {
  return TIPOS.includes(value as Tipo) ? (value as Tipo) : "VENDA_BALCAO";
}

export default async function AtendimentoPage({ searchParams }: { searchParams: { tipo?: string } }) {
  let data: SaleFormData = { clientes: [], produtos: [], vendedores: [] };
  let loadError = "";

  try {
    data = await listSaleFormData();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os dados do atendimento.";
  }

  return (
    <>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <AtendimentoWorkspace data={data} defaultTipo={resolveTipo(searchParams.tipo)} />
    </>
  );
}
