import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { Button } from "@/components/shared/Button";
import { NotasFiscaisList } from "@/components/erp/NotasFiscaisList";
import { listNotasFiscais } from "@/lib/services/fiscal";
import type { NotaFiscalSummary } from "@/lib/services/fiscal";
import { formatBrl } from "@/lib/formatters/currency";

export const dynamic = "force-dynamic";

export default async function FiscalPage() {
  let notas: NotaFiscalSummary[] = [];
  let loadError = "";

  try {
    notas = await listNotasFiscais();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar as notas fiscais.";
  }

  const authorized = notas.filter((n) => n.status === "AUTORIZADA");
  const totalAuthorized = authorized.reduce((sum, n) => sum + n.totalNumber, 0);
  const pending = notas.filter((n) => n.status === "PROCESSANDO" || n.status === "RASCUNHO").length;
  const rejected = notas.filter((n) => n.status === "REJEITADA" || n.status === "ERRO").length;

  return (
    <>
      <PageHeader
        eyebrow="Financeiro & Fiscal"
        title="Documentos fiscais"
        action={<Button href="/erp/configuracoes/fiscal" variant="light">Configurar emissão</Button>}
      >
        <p>NF-e, NFC-e e NFS-e emitidas pela empresa, com cancelamento e carta de correção.</p>
      </PageHeader>

      <div className="kpi-row">
        <KpiCard label="Autorizadas" value={String(authorized.length)} tone="success" />
        <KpiCard label="Valor autorizado" value={formatBrl(totalAuthorized)} tone="info" />
        <KpiCard label="Em processamento" value={String(pending)} tone="warn" />
        <KpiCard label="Rejeitadas / erro" value={String(rejected)} tone={rejected ? "danger" : "default"} />
      </div>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      <NotasFiscaisList notas={notas} />
    </>
  );
}
