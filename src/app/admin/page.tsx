import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { Card } from "@/components/shared/Card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getPlatformMetrics, listClientes } from "@/lib/services/platform-admin";
import type { PlatformMetrics, ClienteSummary } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

export default async function AdminVisaoGeralPage() {
  let metrics: PlatformMetrics | null = null;
  let clientes: ClienteSummary[] = [];
  let loadError = "";

  try {
    [metrics, clientes] = await Promise.all([getPlatformMetrics(), listClientes()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar as métricas da plataforma.";
  }

  const recentes = clientes.slice(0, 5);

  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Visão geral">
        <p>Resumo de clientes, empresas, usuários e emissões fiscais de todo o SaaS.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      {metrics && (
        <>
          <div className="kpi-row">
            <KpiCard label="Clientes ativos" value={String(metrics.tenantsAtivos)} tone="success" />
            <KpiCard label="Clientes bloqueados" value={String(metrics.tenantsBloqueados)} tone={metrics.tenantsBloqueados > 0 ? "danger" : "default"} />
            <KpiCard label="Empresas ativas" value={String(metrics.empresasAtivas)} tone="success" />
            <KpiCard label="Empresas bloqueadas" value={String(metrics.empresasBloqueadas)} tone={metrics.empresasBloqueadas > 0 ? "danger" : "default"} />
          </div>
          <div className="kpi-row">
            <KpiCard label="Usuários ativos" value={String(metrics.usuariosAtivos)} tone="info" />
            <KpiCard label="Notas autorizadas (30d)" value={String(metrics.notasAutorizadas30d)} tone="success" />
            <KpiCard label="Notas com problema" value={String(metrics.notasComProblema)} tone={metrics.notasComProblema > 0 ? "danger" : "default"} />
            <KpiCard label="Total de clientes" value={String(metrics.totalTenants)} />
          </div>

          <Card>
            <div className="erp-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Clientes mais recentes</h3>
              <Link className="btn-erp link" href="/admin/clientes">Ver todos</Link>
            </div>
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th className="num">Empresas</th>
                    <th className="num">Usuários</th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.length === 0 && (
                    <tr>
                      <td colSpan={4}>Nenhum cliente cadastrado ainda.</td>
                    </tr>
                  )}
                  {recentes.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/admin/clientes/${c.id}`} className="bold">{c.nome}</Link>
                      </td>
                      <td><StatusBadge tone={c.statusTone}>{c.statusLabel}</StatusBadge></td>
                      <td className="num">{c.totalEmpresas}</td>
                      <td className="num">{c.totalUsuarios}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
