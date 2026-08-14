import { PageHeader } from "@/components/shared/PageHeader";
import { MdfeManager } from "@/components/erp/MdfeManager";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

/** MDF-e (modelo 58): manifesto para transporte de carga própria entre municípios/UFs. */
export default async function MdfePage() {
  if (!(await moduloLiberadoNoScope("fiscalHabilitado"))) return <ModuloBloqueado titulo="Fiscal indisponível" />;
  return (
    <>
      <PageHeader eyebrow="Fiscal" title="MDF-e — Manifesto de transporte">
        <p>Obrigatório ao transportar mercadoria própria para OUTRO município/UF com veículo da empresa. Emita ao sair e <strong>encerre ao chegar</strong>.</p>
      </PageHeader>
      <MdfeManager />
    </>
  );
}
