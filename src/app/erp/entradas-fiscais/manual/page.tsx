import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { getManualFiscalEntryFormData } from "@/domains/products/application/fiscal-entry-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { listFormasPagamentoAtivas } from "@/domains/finance/application/payment-config-use-cases";
import { listUnidades } from "@/lib/services/products";
import { ManualFiscalEntryForm } from "@/components/erp/ManualFiscalEntryForm";

export const dynamic = "force-dynamic";

export default async function ManualFiscalEntryPage() {
  const scope = await getDevelopmentTenantScope();
  const [formData, formasPagamento, unidades] = await Promise.all([
    getManualFiscalEntryFormData(scope),
    listFormasPagamentoAtivas(scope),
    listUnidades()
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Entradas fiscais"
        title="Lançamento manual de nota de entrada"
        action={<Link className="btn-erp ghost sm" href="/erp/entradas-fiscais/nova">← Voltar</Link>}
      >
        <p className="block-muted">
          Digite todos os dados da nota (sem XML): fornecedor, cabeçalho, itens e parcelas. Compra em fardo/caixa e vende
          unitário? Informe o <strong>fator de conversão</strong> por item — o estoque entra na unidade de venda.
          Ao lançar, você revisa e processa a entrada normalmente.
        </p>
      </PageHeader>
      <ManualFiscalEntryForm
        fornecedores={formData.fornecedores}
        produtos={formData.produtos}
        formasPagamento={formasPagamento.map((f) => f.nome)}
        unidades={unidades.map((u) => u.codigo)}
      />
    </>
  );
}
