import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { getCaixaAberto, getResumoCaixa, type ResumoCaixa } from "@/domains/cashier/application/cashier-use-cases";

export type PreVendaResumo = {
  id: string;
  numero: string;
  clienteNome: string | null;
  clienteDocumento: string | null;
  temCliente: boolean;
  total: number;
  qtdItens: number;
  criadoEm: string;
};

export type CaixaPageData = {
  caixa: { id: string; operador: string; abertoEm: string; resumo: ResumoCaixa } | null;
  preVendas: PreVendaResumo[];
};

/** Dados da tela de caixa: turno aberto (com resumo) e pré-vendas aguardando pagamento. */
export async function getCaixaPageData(): Promise<CaixaPageData> {
  const scope = await getDevelopmentTenantScope();
  const aberto = await getCaixaAberto(scope);

  const pedidos = await prisma.pedidoVenda.findMany({
    where: { ...scopedByTenantCompany(scope), status: "AGUARDANDO_PAGAMENTO" },
    orderBy: { criadoEm: "desc" },
    take: 100,
    include: {
      cliente: { select: { razaoSocial: true, nomeFantasia: true, documento: true } },
      itens: { select: { id: true } }
    }
  });

  const preVendas: PreVendaResumo[] = pedidos.map((p) => ({
    id: p.id,
    numero: p.numero,
    clienteNome: p.cliente ? (p.cliente.nomeFantasia ?? p.cliente.razaoSocial) : null,
    clienteDocumento: p.cliente?.documento ?? null,
    temCliente: Boolean(p.clienteId),
    total: Number(p.total),
    qtdItens: p.itens.length,
    criadoEm: p.criadoEm.toLocaleString("pt-BR")
  }));

  return {
    caixa: aberto
      ? {
          id: aberto.id,
          operador: aberto.operador,
          abertoEm: aberto.abertoEm.toLocaleString("pt-BR"),
          resumo: await getResumoCaixa(scope, aberto.id)
        }
      : null,
    preVendas
  };
}
