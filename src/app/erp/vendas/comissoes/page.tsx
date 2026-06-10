import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { KpiCard } from "@/components/shared/KpiCard";
import { ComissoesList } from "@/components/erp/ComissoesList";
import { listComissoes, listVendedores } from "@/domains/sales/application/comissao-use-cases";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession } from "@/lib/auth/session";
import { isAdminPerfil } from "@/lib/auth/modules";
import { formatBrl } from "@/lib/formatters/currency";

export const dynamic = "force-dynamic";

export default async function ComissoesPage() {
  const scope = await getDevelopmentTenantScope();
  const [comissoes, vendedores, session] = await Promise.all([
    listComissoes(scope),
    listVendedores(scope),
    getSession()
  ]);
  const isAdmin = isAdminPerfil(session?.perfilNome ?? "");

  const totalAPagar = comissoes.filter((c) => c.status === "A_PAGAR").reduce((s, c) => s + Number(c.valor), 0);
  const totalPago = comissoes.filter((c) => c.status === "PAGO").reduce((s, c) => s + Number(c.valor), 0);

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="Comissões"
        action={<Link className="btn-erp ghost sm" href="/erp/vendas">← Vendas</Link>}
      >
        <p>Comissões apuradas na confirmação de cada venda com vendedor cadastrado.</p>
      </PageHeader>

      <div className="kpi-row">
        <KpiCard label="A pagar" value={formatBrl(totalAPagar)} tone={totalAPagar > 0 ? "warn" : "default"} />
        <KpiCard label="Pago (acumulado)" value={formatBrl(totalPago)} tone="success" />
        <KpiCard label="Vendedores ativos" value={String(vendedores.filter((v) => v.ativo).length)} tone="info" />
      </div>

      <ComissoesList
        comissoes={comissoes.map((c) => ({
          id: c.id,
          vendedorId: c.vendedorId,
          vendedorNome: c.vendedor.nome,
          pedidoId: c.pedidoVenda?.id ?? null,
          pedidoNumero: c.pedidoVenda?.numero ?? "—",
          base: Number(c.base),
          percentual: Number(c.percentual),
          valor: Number(c.valor),
          status: c.status,
          criadoEm: c.criadoEm.toLocaleDateString("pt-BR"),
          pagoEm: c.pagoEm ? c.pagoEm.toLocaleDateString("pt-BR") : null
        }))}
        vendedores={vendedores.map((v) => ({ id: v.id, nome: v.nome }))}
        isAdmin={isAdmin}
      />
    </>
  );
}
