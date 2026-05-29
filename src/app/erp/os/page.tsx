import { OrdensServicoList } from "@/components/erp/OrdensServicoList";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { listOrdensServico } from "@/lib/services/service-order";
import type { OrdemServicoSummary } from "@/lib/services/service-order";

export const dynamic = "force-dynamic";

export default async function OrdensServicoPage() {
  let oss: OrdemServicoSummary[] = [];
  let loadError = "";

  try {
    oss = await listOrdensServico();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar ordens de serviço.";
  }

  const total = oss.length;
  const abertas = oss.filter((o) => o.status === "ABERTA").length;
  const emAndamento = oss.filter((o) => o.status === "EM_ANDAMENTO").length;
  const finalizadas = oss.filter((o) => o.status === "FINALIZADA_NAO_FATURADA").length;
  const faturadas = oss.filter((o) => o.status === "FATURADA").length;

  return (
    <>
      <PageHeader
        eyebrow="Serviços"
        title="Ordens de Serviço"
        action={<Button href="/erp/os/nova" variant="primary">+ Nova OS</Button>}
      >
        <p>
          {total} OS · {abertas} abertas · {emAndamento} em andamento · {finalizadas} aguardando faturamento · {faturadas} faturadas
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
          <span>Abertas</span>
          <strong>{abertas}</strong>
        </div>
        <div className="metric">
          <span>Em andamento</span>
          <strong>{emAndamento}</strong>
        </div>
        <div className="metric">
          <span>Aguardando faturar</span>
          <strong>{finalizadas}</strong>
        </div>
        <div className="metric">
          <span>Faturadas</span>
          <strong>{faturadas}</strong>
        </div>
      </div>

      <OrdensServicoList oss={oss} />
    </>
  );
}
