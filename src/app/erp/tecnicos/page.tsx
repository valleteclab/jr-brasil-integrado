import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo, ForbiddenError } from "@/lib/auth/session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { listTecnicos, listUsuariosDaEmpresa } from "@/domains/service-order/application/tecnico-use-cases";
import { TecnicosManager } from "@/components/erp/TecnicosManager";

export const dynamic = "force-dynamic";

export default async function TecnicosPage() {
  const scope = await getDevelopmentTenantScope();
  // RBAC por perfil: o módulo "tecnicos" precisa estar liberado ao perfil do usuário.
  try {
    await requireModulo("tecnicos");
  } catch (e) {
    if (e instanceof ForbiddenError) return <ModuloBloqueado titulo="Técnicos indisponíveis para o seu perfil" />;
    throw e;
  }

  const [tecnicos, usuarios] = await Promise.all([
    listTecnicos(scope, { incluirInativos: true }),
    listUsuariosDaEmpresa(scope)
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Oficina"
        title="Técnicos"
        action={<Button href="/erp/os" variant="light">← Ordens de serviço</Button>}
      >
        <p>Cadastre a equipe da oficina. Vincule um login para o técnico atualizar o que foi feito nas OS.</p>
      </PageHeader>
      <TecnicosManager tecnicos={tecnicos} usuarios={usuarios} />
    </>
  );
}
