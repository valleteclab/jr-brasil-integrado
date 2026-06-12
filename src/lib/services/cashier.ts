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
  /** Forma de pagamento escolhida no balcão (pré-seleciona no caixa). */
  formaPagamento: string | null;
  criadoEm: string;
  itens: Array<{
    id: string;
    produtoNome: string;
    produtoSku: string;
    quantidade: number;
    precoUnitario: number;
    total: number;
  }>;
};

/** Conta recebedora (banco/PIX) para destinar o recebimento de PIX/transferência. */
export type ContaRecebedora = { id: string; nome: string; chavePix: string | null; tipoChavePix: string | null };
/** Maquininha de cartão para gerar o recebível da adquirente (líquido da taxa). */
export type MaquinaCartaoResumo = { id: string; nome: string; adquirente: string | null };

export type CaixaPageData = {
  caixa: { id: string; operador: string; abertoEm: string; resumo: ResumoCaixa } | null;
  preVendas: PreVendaResumo[];
  /** Contas recebedoras (PIX/transferência) e maquininhas (cartão) para detalhar o recebimento. */
  contas: ContaRecebedora[];
  maquinas: MaquinaCartaoResumo[];
  /** Módulo Expedição habilitado para o tenant (mostra a opção de recibo de retirada). */
  expedicaoHabilitada: boolean;
};

/** Dados da tela de caixa: turno aberto (com resumo) e pré-vendas aguardando pagamento. */
export async function getCaixaPageData(): Promise<CaixaPageData> {
  const scope = await getDevelopmentTenantScope();
  const aberto = await getCaixaAberto(scope);
  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { expedicaoHabilitada: true }
  });

  const [contasRaw, maquinasRaw] = await Promise.all([
    prisma.contaBancaria.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      select: { id: true, nome: true, chavePix: true, tipoChavePix: true },
      orderBy: { nome: "asc" }
    }),
    prisma.maquinaCartao.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      select: { id: true, nome: true, adquirente: true },
      orderBy: { nome: "asc" }
    })
  ]);

  const pedidos = await prisma.pedidoVenda.findMany({
    where: { ...scopedByTenantCompany(scope), status: "AGUARDANDO_PAGAMENTO" },
    orderBy: { criadoEm: "desc" },
    take: 100,
    include: {
      cliente: { select: { razaoSocial: true, nomeFantasia: true, documento: true } },
      itens: {
        orderBy: { id: "asc" },
        include: {
          produto: { select: { nome: true, sku: true } }
        }
      }
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
    formaPagamento: p.formaPagamento ?? null,
    criadoEm: p.criadoEm.toLocaleString("pt-BR"),
    itens: p.itens.map((item) => ({
      id: item.id,
      produtoNome: item.produto.nome,
      produtoSku: item.produto.sku,
      quantidade: item.quantidade,
      precoUnitario: Number(item.precoUnitario),
      total: Number(item.total)
    }))
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
    preVendas,
    contas: contasRaw,
    maquinas: maquinasRaw,
    expedicaoHabilitada: Boolean(tenant?.expedicaoHabilitada)
  };
}
