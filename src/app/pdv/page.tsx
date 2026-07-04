import { PdvWorkspace } from "@/components/erp/PdvWorkspace";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { getPdvData } from "@/lib/services/pdv";
import { getCaixaAberto } from "@/domains/cashier/application/cashier-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession } from "@/lib/auth/session";
import { moduloLiberado } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function PdvPage() {
  const scope = await getDevelopmentTenantScope();
  if (!(await moduloLiberado(scope, "pdvTelaCheiaHabilitado"))) return <ModuloBloqueado titulo="PDV indisponível" />;

  const [data, caixa, sessao] = await Promise.all([getPdvData(), getCaixaAberto(scope), getSession()]);
  const caixaAberto = caixa ? { id: caixa.id, operador: caixa.operador, abertoEm: caixa.abertoEm.toISOString() } : null;
  return <PdvWorkspace data={data} caixaAberto={caixaAberto} usuarioNome={sessao?.nome ?? ""} />;
}
