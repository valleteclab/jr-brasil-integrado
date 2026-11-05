import { PageHeader } from "@/components/shared/PageHeader";
import { FaturasCartaoManager } from "@/components/erp/FaturasCartaoManager";
import { listarFaturasCartao, listarLancamentosFatura } from "@/domains/finance/application/fatura-cartao-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { ModuloBloqueado } from "@/components/erp/ModuloBloqueado";
import { moduloLiberadoNoScope } from "@/lib/auth/tenant-features";

export const dynamic = "force-dynamic";

export default async function FaturasCartaoPage() {
  if (!(await moduloLiberadoNoScope("financeiroHabilitado"))) return <ModuloBloqueado titulo="Financeiro indisponível" />;

  const scope = await getDevelopmentTenantScope();
  const faturas = await listarFaturasCartao(scope);

  // Carrega as compras das faturas que ainda estão em aberto ou fechadas: são as que alguém
  // precisa conferir contra a fatura do banco. As já pagas abrem sob demanda numa próxima versão.
  const paraDetalhar = faturas.filter((f) => f.status !== "PAGA" && f.lancamentos > 0).slice(0, 12);
  const detalhes = await Promise.all(paraDetalhar.map((f) => listarLancamentosFatura(scope, f.id)));
  const lancamentosPorFatura = Object.fromEntries(paraDetalhar.map((f, i) => [f.id, detalhes[i]]));

  const abertas = faturas.filter((f) => f.status === "ABERTA");
  const totalAberto = abertas.reduce((soma, f) => soma + f.valorTotal, 0);

  return (
    <section className="erp-page">
      <PageHeader eyebrow="Financeiro" title="Faturas do cartão">
        {abertas.length
          ? `${abertas.length} fatura(s) em aberto somando ${totalAberto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
          : "Compras no cartão de crédito agrupadas por ciclo de fechamento."}
      </PageHeader>
      <FaturasCartaoManager faturas={faturas} lancamentosPorFatura={lancamentosPorFatura} />
    </section>
  );
}
