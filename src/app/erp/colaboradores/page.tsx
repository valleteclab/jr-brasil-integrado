import { TeamManager } from "@/components/erp/TeamManager";
import { PageHeader } from "@/components/shared/PageHeader";
import { listColaboradores, listPerfis } from "@/lib/services/team";
import type { ColaboradorSummary, PerfilSummary } from "@/lib/services/team";

export const dynamic = "force-dynamic";

export default async function ErpColaboradoresPage() {
  let colaboradores: ColaboradorSummary[] = [];
  let perfis: PerfilSummary[] = [];
  let loadError = "";

  try {
    [colaboradores, perfis] = await Promise.all([listColaboradores(), listPerfis()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar colaboradores.";
  }

  return (
    <>
      <PageHeader eyebrow="Equipe" title="Colaboradores">
        <p>
          {colaboradores.length} colaboradores vinculados · Gerencie acessos, perfis e permissões por módulo.
        </p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}

      <TeamManager initialColaboradores={colaboradores} initialPerfis={perfis} />
    </>
  );
}
