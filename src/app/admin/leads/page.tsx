import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { KpiCard } from "@/components/shared/KpiCard";
import { CommercialLeadsPanel } from "@/components/admin/CommercialLeadsPanel";
import { ImportadorLeadsPanel } from "@/components/admin/ImportadorLeadsPanel";
import {
  getCommercialLeadMetrics,
  listCommercialLeads
} from "@/domains/platform-sales/application/commercial-lead-use-cases";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  let error = "";
  let metrics = {
    total: 0,
    novos: 0,
    emConversa: 0,
    qualificados: 0,
    testes: 0,
    assinantes: 0,
    precisaHumano: 0,
    followupsPendentes: 0
  };
  let leads: Awaited<ReturnType<typeof listCommercialLeads>> = [];
  try {
    [metrics, leads] = await Promise.all([
      getCommercialLeadMetrics(),
      listCommercialLeads()
    ]);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Não foi possível carregar os leads.";
  }

  const serialized = leads.map((lead) => ({
    id: lead.id,
    nome: lead.nome,
    empresa: lead.empresa,
    telefone: lead.telefone,
    email: lead.email,
    segmento: lead.segmento,
    status: lead.status,
    canalOrigem: lead.canalOrigem,
    origem: lead.origem,
    campanha: lead.campanha,
    score: lead.score,
    precisaHumano: lead.precisaHumano,
    ultimoContatoEm: lead.ultimoContatoEm?.toISOString() ?? null,
    proximoFollowupEm: lead.proximoFollowupEm?.toISOString() ?? null,
    atualizadoEm: lead.atualizadoEm.toISOString(),
    ultimaInteracao: lead.interacoes[0]?.conteudo ?? null
  }));

  return (
    <>
      <PageHeader
        eyebrow="Comercial"
        title="Leads do XERP"
        action={<Button href="/admin/agente-comercial">Configurar agente</Button>}
      >
        <p>Funil da plataforma antes do cadastro do cliente. Leads ainda não acessam nenhum dado do ERP.</p>
      </PageHeader>

      {error && (
        <div className="system-error">
          <strong>Não foi possível carregar o funil</strong>
          <span>{error}</span>
        </div>
      )}

      {!error && (
        <>
          <div className="kpi-row">
            <KpiCard label="Total de leads" value={String(metrics.total)} />
            <KpiCard label="Novos / conversa" value={String(metrics.novos + metrics.emConversa)} tone="info" />
            <KpiCard label="Qualificados" value={String(metrics.qualificados)} tone="success" />
            <KpiCard label="Assinantes" value={String(metrics.assinantes)} tone="success" />
          </div>
          <div className="kpi-row">
            <KpiCard label="Em teste" value={String(metrics.testes)} tone="info" />
            <KpiCard label="Pedindo humano" value={String(metrics.precisaHumano)} tone={metrics.precisaHumano ? "warn" : "default"} />
            <KpiCard label="Follow-ups vencidos" value={String(metrics.followupsPendentes)} tone={metrics.followupsPendentes ? "warn" : "default"} />
            <KpiCard label="Meta ativa" value="500" />
          </div>
          <ImportadorLeadsPanel />
          <CommercialLeadsPanel initialLeads={serialized} />
        </>
      )}
    </>
  );
}
