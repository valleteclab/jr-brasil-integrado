import { OrdensServicoList } from "@/components/erp/OrdensServicoList";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { KpiCard } from "@/components/shared/KpiCard";
import { listOrdensServico } from "@/lib/services/service-order";
import type { OrdemServicoSummary } from "@/lib/services/service-order";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listPecasAguardandoCompra } from "@/domains/service-order/application/service-order-use-cases";

export const dynamic = "force-dynamic";

export default async function OrdensServicoPage() {
  if (!(await moduloLiberadoNoScope("ordemServicoHabilitada"))) return <ModuloBloqueado titulo="Ordens de Serviço indisponível" />;

  let oss: OrdemServicoSummary[] = [];
  let pecasAComprar: Awaited<ReturnType<typeof listPecasAguardandoCompra>> = [];
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    [oss, pecasAComprar] = await Promise.all([listOrdensServico(), listPecasAguardandoCompra(scope)]);
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
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button href="/erp/tecnicos" variant="light">👨‍🔧 Técnicos</Button>
            <a className="btn-erp light" href="/oficina" target="_blank" rel="noopener noreferrer" title="Abre o painel de acompanhamento em nova aba (para a TV da oficina)">📺 Painel da oficina</a>
            <Button href="/erp/os/nova" variant="primary">+ Nova OS</Button>
          </div>
        }
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
        <KpiCard label="Total" value={String(total)} />
        <KpiCard label="Abertas" value={String(abertas)} />
        <KpiCard label="Em andamento" value={String(emAndamento)} />
        <KpiCard label="Aguardando faturar" value={String(finalizadas)} />
        <KpiCard label="Faturadas" value={String(faturadas)} />
      </div>

      {pecasAComprar.length > 0 && (
        <section className="erp-card" style={{ marginBottom: 16, borderLeft: "3px solid var(--erp-warn, #f59e0b)" }}>
          <div className="erp-card-head"><h3>🛒 Peças a comprar ({pecasAComprar.length})</h3></div>
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead><tr><th>Peça</th><th className="num">Qtd.</th><th>OS</th><th>Cliente / equipamento</th></tr></thead>
              <tbody>
                {pecasAComprar.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.nome}</strong><span className="sublabel">{p.sku}</span></td>
                    <td className="num">{p.quantidade}</td>
                    <td><a href={`/erp/os/${p.osId}`}>OS {p.osNumero}</a></td>
                    <td>{p.cliente}<span className="sublabel">{p.equipamento}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="erp-card-body"><small style={{ color: "var(--erp-slate, #64748b)" }}>Quando a nota de entrada dessas peças chegar (importada em Notas de Entrada), a OS é avisada automaticamente e a peça sai desta lista.</small></div>
        </section>
      )}

      <OrdensServicoList oss={oss} />
    </>
  );
}
