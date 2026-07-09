import { PageHeader } from "@/components/shared/PageHeader";
import { PlanosSaasForm } from "@/components/admin/PlanosSaasForm";
import { listPlanosSaas, type PlanoSaasRow } from "@/lib/services/platform-admin";

export const dynamic = "force-dynamic";

export default async function AdminPlanosPage() {
  let planos: PlanoSaasRow[] = [];
  let erro = "";
  try {
    planos = await listPlanosSaas();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Não foi possível carregar os planos.";
  }
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Planos & preços">
        <p>
          Defina aqui a <strong>mensalidade</strong>, o <strong>limite de notas/mês</strong> e o
          <strong> trial</strong> de cada plano — nada fica fixo no código. O limite é aplicado na
          emissão fiscal dos clientes daquele plano.
        </p>
      </PageHeader>
      {erro && <div className="system-error"><strong>Erro</strong><span>{erro}</span></div>}
      {!erro && <PlanosSaasForm planos={planos} />}
    </>
  );
}
