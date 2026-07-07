import { PageHeader } from "@/components/shared/PageHeader";
import { CreditoPlataformaForm } from "@/components/admin/CreditoPlataformaForm";
import { getCreditoPlataformaAdmin } from "@/lib/services/credito-plataforma-admin";

export const dynamic = "force-dynamic";

export default async function AdminCreditoPage() {
  let dados = null;
  let erro = "";
  try {
    dados = await getCreditoPlataformaAdmin();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Não foi possível carregar.";
  }
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Crédito & bureau (revenda)">
        <p>
          Configure a cobrança das recargas (<strong>Asaas</strong> — sua conta), o bureau de crédito
          (<strong>ApiBrasil</strong> — conta mestre) e o <strong>preço de revenda</strong> por consulta.
          Vale para <strong>todos</strong> os tenants; as credenciais são criptografadas.
        </p>
      </PageHeader>
      {erro && <div className="system-error"><strong>Erro</strong><span>{erro}</span></div>}
      {dados && <CreditoPlataformaForm dados={dados} />}
    </>
  );
}
