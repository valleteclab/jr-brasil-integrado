import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { moduloLiberado } from "@/lib/auth/tenant-features";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { OficinaPainel } from "@/components/erp/OficinaPainel";

export const dynamic = "force-dynamic";

// A página só monta a estrutura (SSR leve); o painel busca e atualiza os dados no cliente via SSE.
export default async function OficinaPainelPage() {
  const scope = await getDevelopmentTenantScope();
  if (!(await moduloLiberado(scope, "ordemServicoHabilitada"))) {
    return <ModuloBloqueado titulo="Ordens de serviço indisponíveis" />;
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { razaoSocial: true, nomeFantasia: true }
  });
  const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || "Oficina";

  return <OficinaPainel inicial={null} empresaNome={empresaNome} />;
}
