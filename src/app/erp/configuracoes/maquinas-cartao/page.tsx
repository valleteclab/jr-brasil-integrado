import { PageHeader } from "@/components/shared/PageHeader";
import { MaquinasCartaoManager } from "@/components/erp/MaquinasCartaoManager";
import { listMaquinasCartao, listContasFinanceiras } from "@/domains/finance/application/payment-config-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function MaquinasCartaoPage() {
  let maquinas: Array<{
    id: string;
    nome: string;
    adquirente: string | null;
    contaBancariaId: string | null;
    taxaDebito: number;
    taxaCredito: number;
    taxaCreditoParcelado: number;
    prazoDebitoDias: number;
    prazoCreditoDias: number;
    ativo: boolean;
  }> = [];
  let contas: Array<{ id: string; nome: string }> = [];
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    const [maquinasRows, contasRows] = await Promise.all([listMaquinasCartao(scope), listContasFinanceiras(scope)]);
    maquinas = maquinasRows.map((m) => ({
      id: m.id,
      nome: m.nome,
      adquirente: m.adquirente,
      contaBancariaId: m.contaBancariaId,
      taxaDebito: Number(m.taxaDebito),
      taxaCredito: Number(m.taxaCredito),
      taxaCreditoParcelado: Number(m.taxaCreditoParcelado),
      prazoDebitoDias: m.prazoDebitoDias,
      prazoCreditoDias: m.prazoCreditoDias,
      ativo: m.ativo
    }));
    contas = contasRows.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar as máquinas de cartão.";
  }

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Máquinas de cartão">
        <p>
          Cadastre as <strong>maquininhas</strong> usadas no recebimento (Cielo, Stone, PagSeguro…).
          Informe as taxas de débito, crédito à vista e crédito parcelado, e os prazos de liquidação.
          Vincule a conta financeira em que o dinheiro cai para conciliar os recebimentos.
        </p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <MaquinasCartaoManager initial={maquinas} contas={contas} />
    </>
  );
}
