import { PageHeader } from "@/components/shared/PageHeader";
import { GastosManager } from "@/components/erp/GastosManager";
import { listGastos, getGastosResumo } from "@/lib/services/gastos";
import type { GastoRow, GastosResumo } from "@/lib/services/gastos";
import { getSession } from "@/lib/auth/session";
import { isAdminPerfil } from "@/lib/auth/modules";
import { DESPESA_CATEGORIAS } from "@/domains/expenses/categorias";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function GastosPage() {
  if (!(await moduloLiberadoNoScope("gastosHabilitado"))) return <ModuloBloqueado titulo="Gastos indisponível" />;

  let gastos: GastoRow[] = [];
  let resumo: GastosResumo | null = null;
  let loadError = "";

  try {
    [gastos, resumo] = await Promise.all([listGastos(), getGastosResumo()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar os gastos.";
  }

  const session = await getSession();
  const isAdmin = isAdminPerfil(session?.perfilNome ?? "");

  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Gastos">
        <p>Fotografe o cupom e a IA registra o gasto. Controle por categoria e período.</p>
      </PageHeader>

      {loadError && (
        <div className="system-error">
          <strong>Não foi possível carregar</strong>
          <span>{loadError}</span>
        </div>
      )}

      {!loadError && resumo && (
        <GastosManager
          initialGastos={gastos}
          resumo={resumo}
          categorias={DESPESA_CATEGORIAS}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}
