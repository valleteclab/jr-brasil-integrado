import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getCaixaAberto, getResumoCaixa, type ResumoCaixa } from "@/domains/cashier/application/cashier-use-cases";
import { listContasComCobranca } from "@/domains/finance/application/boleto-use-cases";

export type PreVendaResumo = {
  id: string;
  numero: string;
  clienteId: string | null;
  clienteNome: string | null;
  clienteDocumento: string | null;
  temCliente: boolean;
  total: number;
  qtdItens: number;
  /** Forma de pagamento escolhida no balcão (pré-seleciona no caixa). */
  formaPagamento: string | null;
  criadoEm: string;
  /** Pix DINÂMICOS já PAGOS deste pedido e ainda não aproveitados num recebimento (venda
   *  interrompida no meio): viram linha travada no caixa e abatem do que falta. */
  pixPagos: Array<{ id: string; valor: number; contaBancariaId: string }>;
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
  /** Nome do usuário logado — é ele quem abre o caixa (não se digita mais o operador). */
  usuarioNome: string;
  /** Usuário tem o módulo financeiro (pode liberar venda faturada direto na tela). */
  podeFinanceiro: boolean;
  preVendas: PreVendaResumo[];
  /** Contas recebedoras (PIX/transferência) e maquininhas (cartão) para detalhar o recebimento. */
  contas: ContaRecebedora[];
  maquinas: MaquinaCartaoResumo[];
  /** Formas de pagamento cadastradas (ativas) — o que aparece na tela do caixa. */
  formas: Array<{ id: string; nome: string; tipo: string }>;
  /** Clientes para identificar o consumidor anônimo direto no caixa. */
  clientes: Array<{ id: string; label: string; documento: string | null }>;
  /** Módulo Expedição habilitado para o tenant (mostra a opção de recibo de retirada). */
  expedicaoHabilitada: boolean;
  /** Empresa permite fechar a venda só com RECIBO (sem NF). Mostra opção no caixa. */
  permiteVendaNaoFiscal: boolean;
  /** Contas com cobrança de boleto ativa (o operador escolhe a conta/banco na venda em boleto). */
  contasCobranca: Array<{ id: string; nome: string }>;
};

/** Dados da tela de caixa: turno aberto (com resumo) e pré-vendas aguardando pagamento. */
export async function getCaixaPageData(): Promise<CaixaPageData> {
  const scope = await getDevelopmentTenantScope();
  const sessao = await getSession();
  const aberto = await getCaixaAberto(scope);
  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { expedicaoHabilitada: true }
  });
  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { permiteVendaNaoFiscal: true }
  });

  const [contasRaw, maquinasRaw, clientesRaw] = await Promise.all([
    prisma.contaBancaria.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      select: { id: true, nome: true, chavePix: true, tipoChavePix: true },
      orderBy: { nome: "asc" }
    }),
    prisma.maquinaCartao.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      select: { id: true, nome: true, adquirente: true },
      orderBy: { nome: "asc" }
    }),
    prisma.cliente.findMany({
      where: { ...scopedByTenantCompany(scope), status: "ATIVO" },
      select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true },
      orderBy: { razaoSocial: "asc" },
      take: 1000
    })
  ]);

  const pedidos = await prisma.pedidoVenda.findMany({
    where: { ...scopedByTenantCompanyAmbiente(scope), status: "AGUARDANDO_PAGAMENTO" },
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

  // Pix pagos e não consumidos dos pedidos em aberto (retomada de venda interrompida).
  const pixPagosRaw = pedidos.length
    ? await prisma.pixCobranca.findMany({
        where: {
          ...scopedByTenantCompany(scope),
          pedidoVendaId: { in: pedidos.map((p) => p.id) },
          status: "CONCLUIDA",
          contaReceberId: null,
          consumidaEm: null
        },
        select: { id: true, pedidoVendaId: true, valor: true, contaBancariaId: true }
      })
    : [];

  const preVendas: PreVendaResumo[] = pedidos.map((p) => ({
    id: p.id,
    numero: p.numero,
    clienteNome: p.cliente ? (p.cliente.nomeFantasia ?? p.cliente.razaoSocial) : null,
    clienteDocumento: p.cliente?.documento ?? null,
    clienteId: p.clienteId ?? null,
    temCliente: Boolean(p.clienteId),
    total: Number(p.total),
    qtdItens: p.itens.length,
    formaPagamento: p.formaPagamento ?? null,
    criadoEm: p.criadoEm.toLocaleString("pt-BR"),
    pixPagos: pixPagosRaw
      .filter((x) => x.pedidoVendaId === p.id)
      .map((x) => ({ id: x.id, valor: Number(x.valor), contaBancariaId: x.contaBancariaId })),
    itens: p.itens.map((item) => ({
      id: item.id,
      produtoNome: item.produto.nome,
      produtoSku: item.produto.sku,
      quantidade: Number(item.quantidade),
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
    usuarioNome: sessao?.nome ?? "",
    podeFinanceiro: Boolean(sessao?.modulos.includes("financeiro")),
    preVendas,
    contas: contasRaw,
    maquinas: maquinasRaw,
    formas: await prisma.formaPagamento.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, tipo: true }
    }),
    clientes: clientesRaw.map((c) => ({
      id: c.id,
      label: c.nomeFantasia ? `${c.nomeFantasia} (${c.razaoSocial})` : c.razaoSocial,
      documento: c.documento ?? null
    })),
    expedicaoHabilitada: Boolean(tenant?.expedicaoHabilitada),
    permiteVendaNaoFiscal: Boolean(empresa?.permiteVendaNaoFiscal),
    contasCobranca: await listContasComCobranca(scope)
  };
}
