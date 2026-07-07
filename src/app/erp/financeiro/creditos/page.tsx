import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/shared/Button";
import { CarteiraCreditoWorkspace } from "@/components/erp/CarteiraCreditoWorkspace";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";
import { getCarteira, listarRecargas } from "@/domains/credito/application/carteira-use-cases";

export const dynamic = "force-dynamic";

export default async function CreditosPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const carteira = await getCarteira(scope);
  const recargas = await listarRecargas(scope);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · Créditos"
        title="Créditos de consulta de crédito"
        action={<Button href="/erp/financeiro" variant="light">← Voltar ao financeiro</Button>}
      >
        <p>
          Saldo pré-pago usado nas <strong>consultas de crédito</strong> (aprovação de PF/PJ para venda a prazo).
          Recarregue por <strong>Pix</strong> — o crédito cai na hora que o pagamento é confirmado.
        </p>
      </PageHeader>
      <CarteiraCreditoWorkspace
        saldoInicial={Number(carteira.saldo)}
        recargasIniciais={recargas.map((r) => ({ id: r.id, valor: Number(r.valor), status: r.status, criadoEm: r.criadoEm.toISOString(), pagoEm: r.pagoEm?.toISOString() ?? null }))}
      />
    </>
  );
}
