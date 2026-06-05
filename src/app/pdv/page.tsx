import { PdvWorkspace } from "@/components/erp/PdvWorkspace";
import { getPdvData } from "@/lib/services/pdv";
import { getCaixaAberto } from "@/domains/cashier/application/cashier-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function PdvPage() {
  const scope = await getDevelopmentTenantScope();
  const [data, caixa] = await Promise.all([getPdvData(), getCaixaAberto(scope)]);
  const caixaAberto = caixa ? { id: caixa.id, operador: caixa.operador, abertoEm: caixa.abertoEm.toISOString() } : null;
  return <PdvWorkspace data={data} caixaAberto={caixaAberto} />;
}
