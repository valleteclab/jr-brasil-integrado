import { PageHeader } from "@/components/shared/PageHeader";
import { ReformaMonitorPanel } from "@/components/admin/ReformaMonitorPanel";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getMonitorReformaAdmin, type MonitorReformaAdminData } from "@/domains/fiscal/application/reforma-monitor-use-cases";

export const dynamic = "force-dynamic";

/** Monitor da Reforma Tributária — só o DONO do SaaS (plataformaAdmin). */
export default async function AdminReformaPage() {
  let dados: MonitorReformaAdminData | null = null;
  let erro = "";
  try {
    await requirePlatformAdmin();
    dados = await getMonitorReformaAdmin();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Não foi possível carregar o monitor.";
  }
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Reforma Tributária (IBS/CBS)">
        <p>
          Acompanhamento automático das <strong>fontes oficiais</strong> (NTs da NF-e e leiautes da
          NFS-e nacional) e <strong>prontidão do sistema</strong> — novidades chegam pelo sino.
        </p>
      </PageHeader>
      {erro && <div className="system-error"><strong>Erro</strong><span>{erro}</span></div>}
      {dados && <ReformaMonitorPanel inicial={dados} />}
    </>
  );
}
