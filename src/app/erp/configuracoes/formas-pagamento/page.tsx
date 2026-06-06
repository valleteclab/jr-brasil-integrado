import { PageHeader } from "@/components/shared/PageHeader";
import { FormasPagamentoManager } from "@/components/erp/FormasPagamentoManager";
import { listFormasPagamento, listContasFinanceiras } from "@/domains/finance/application/payment-config-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";

export const dynamic = "force-dynamic";

export default async function FormasPagamentoPage() {
  let formas: Array<{ id: string; nome: string; tipo: string; contaBancariaId: string | null; contaNome: string | null; ordem: number; ativo: boolean }> = [];
  let contas: Array<{ id: string; nome: string }> = [];
  let loadError = "";

  try {
    const scope = await getDevelopmentTenantScope();
    const [formasRows, contasRows] = await Promise.all([listFormasPagamento(scope), listContasFinanceiras(scope)]);
    formas = formasRows.map((f) => ({
      id: f.id,
      nome: f.nome,
      tipo: f.tipo,
      contaBancariaId: f.contaBancariaId,
      contaNome: f.contaBancaria?.nome ?? null,
      ordem: f.ordem,
      ativo: f.ativo
    }));
    contas = contasRows.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Não foi possível carregar as formas de pagamento.";
  }

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Formas de pagamento">
        <p>
          Cadastre como a empresa <strong>paga</strong> suas contas (dinheiro, pix, cartão, boleto,
          transferência…). Cada forma pode apontar para a conta financeira de onde sai o dinheiro.
          Usado no lançamento de notas de entrada e nas contas a pagar, padronizando os dados para
          relatórios de despesas. Não se aplica a recebimentos de clientes.
        </p>
      </PageHeader>
      {loadError && (
        <div className="system-error">
          <strong>Banco de dados indisponível</strong>
          <span>{loadError}</span>
        </div>
      )}
      <FormasPagamentoManager initial={formas} contas={contas} />
    </>
  );
}
