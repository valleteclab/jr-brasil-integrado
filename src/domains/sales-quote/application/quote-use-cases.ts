import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { nextDocumentNumber } from "@/lib/numbering";
import { getDefaultDeposito, reserveStock } from "@/domains/stock/application/stock-service";

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

export type CreateQuoteInput = {
  clienteId: string;
  itens: Array<{
    produtoId: string;
    quantidade: number;
    precoUnitario: number;
  }>;
  validadeDias?: number;
  vendedor?: string;
  /** Vendedor cadastrado — propagado ao pedido na conversão (comissão na confirmação). */
  vendedorId?: string | null;
  condicaoPagamento?: string;
  desconto?: number;
  observacaoVendedor?: string;
  /** Origem do orçamento (ex.: "LOJA" para solicitações vindas da loja virtual). Padrão MANUAL. */
  canal?: string;
};

export async function createQuote(scope: TenantScope, input: CreateQuoteInput) {
  if (!input.clienteId) throw new Error("Cliente é obrigatório.");
  if (!input.itens || input.itens.length === 0) throw new Error("O orçamento deve ter ao menos um item.");

  return prisma.$transaction(async (tx) => {
    const numero = await nextDocumentNumber(tx, scope, "ORC", tx.orcamento);

    const subtotal = input.itens.reduce(
      (acc, item) => acc + item.quantidade * item.precoUnitario,
      0
    );
    const desconto = input.desconto ?? 0;
    const total = Math.max(0, subtotal - desconto);

    const validoAte = input.validadeDias
      ? new Date(Date.now() + input.validadeDias * 24 * 60 * 60 * 1000)
      : null;

    // Vendedor cadastrado: valida e usa o nome dele como rótulo quando não informado.
    let vendedorNome = input.vendedor ?? null;
    if (input.vendedorId) {
      const vendedorCadastrado = await tx.vendedor.findFirst({
        where: { id: input.vendedorId, ...scopedByTenantCompany(scope), ativo: true }
      });
      if (!vendedorCadastrado) throw new Error("Vendedor não encontrado ou inativo.");
      vendedorNome = vendedorNome ?? vendedorCadastrado.nome;
    }

    const orcamento = await tx.orcamento.create({
      data: {
        ...scopedByTenantCompany(scope),
        numero,
        clienteId: input.clienteId,
        canal: input.canal ?? "MANUAL",
        status: "EM_ANALISE",
        validoAte,
        vendedor: vendedorNome,
        vendedorId: input.vendedorId ?? null,
        condicaoPagamento: input.condicaoPagamento ?? null,
        observacaoVendedor: input.observacaoVendedor ?? null,
        desconto,
        subtotal,
        total,
        itens: {
          create: input.itens.map((item) => ({
            ...scopedByTenantCompany(scope),
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            total: item.quantidade * item.precoUnitario,
          })),
        },
      },
      include: { itens: true },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Orcamento",
      entidadeId: orcamento.id,
      acao: "CREATE",
      payload: { numero, clienteId: input.clienteId, total },
    });

    return orcamento;
  }, TX_OPTIONS);
}

/** Status em que a validade ainda corre (pode expirar). */
const STATUS_EXPIRAVEIS = ["RASCUNHO", "EM_ANALISE", "AGUARDANDO_CLIENTE"] as const;

/**
 * Marca como EXPIRADO os orçamentos vencidos (validoAte no passado) que ainda aguardam
 * decisão. Expiração "preguiçosa": chamada na listagem e nos guards de aprovar/converter —
 * não há job/cron; o estado converge sempre que alguém olha ou mexe nos orçamentos.
 */
export async function expireQuotesVencidos(scope: TenantScope): Promise<number> {
  const { count } = await prisma.orcamento.updateMany({
    where: {
      ...scopedByTenantCompany(scope),
      status: { in: [...STATUS_EXPIRAVEIS] },
      validoAte: { lt: new Date() }
    },
    data: { status: "EXPIRADO" }
  });
  return count;
}

/** Guard: orçamento vencido é marcado EXPIRADO e a ação é bloqueada com mensagem clara. */
async function bloquearSeVencido(
  tx: { orcamento: { update: (args: { where: { id: string }; data: { status: "EXPIRADO" } }) => Promise<unknown> } },
  orc: { id: string; numero: string; status: string; validoAte: Date | null }
) {
  if (!orc.validoAte) return;
  if (!(STATUS_EXPIRAVEIS as readonly string[]).includes(orc.status)) return;
  if (orc.validoAte >= new Date()) return;
  await tx.orcamento.update({ where: { id: orc.id }, data: { status: "EXPIRADO" } });
  throw new Error(
    `Orçamento ${orc.numero} expirou em ${orc.validoAte.toLocaleDateString("pt-BR")}. Crie um novo orçamento com preços atualizados.`
  );
}

export async function approveQuote(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const orc = await tx.orcamento.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
    });
    if (!orc) throw new Error("Orçamento não encontrado.");
    if (orc.status === "APROVADO") return orc;
    await bloquearSeVencido(tx, orc);
    if (!["EM_ANALISE", "AGUARDANDO_CLIENTE", "RASCUNHO"].includes(orc.status)) {
      throw new Error(`Orçamento com status ${orc.status} não pode ser aprovado.`);
    }

    const updated = await tx.orcamento.update({
      where: { id },
      data: { status: "APROVADO", aprovadoEm: new Date() },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Orcamento",
      entidadeId: id,
      acao: "APPROVE",
    });

    return updated;
  }, TX_OPTIONS);
}

export async function rejectQuote(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const orc = await tx.orcamento.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
    });
    if (!orc) throw new Error("Orçamento não encontrado.");
    if (orc.status === "REJEITADO") return orc;
    if (["CONVERTIDO", "REJEITADO"].includes(orc.status)) {
      throw new Error(`Orçamento com status ${orc.status} não pode ser rejeitado.`);
    }

    const updated = await tx.orcamento.update({
      where: { id },
      data: { status: "REJEITADO" },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Orcamento",
      entidadeId: id,
      acao: "REJECT",
    });

    return updated;
  }, TX_OPTIONS);
}

export async function convertQuoteToPedido(scope: TenantScope, id: string) {
  return prisma.$transaction(async (tx) => {
    const orc = await tx.orcamento.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
      include: {
        itens: {
          include: { produto: { select: { id: true, custoMedio: true, precoCusto: true } } },
        },
      },
    });

    if (!orc) throw new Error("Orçamento não encontrado.");
    if (orc.status !== "APROVADO") {
      throw new Error("Somente orçamentos APROVADOS podem ser convertidos em pedido.");
    }

    const numeroPedido = await nextDocumentNumber(tx, scope, "PV", tx.pedidoVenda);
    const deposito = await getDefaultDeposito(tx, scope);

    const pedido = await tx.pedidoVenda.create({
      data: {
        ...scopedByTenantCompany(scope),
        numero: numeroPedido,
        clienteId: orc.clienteId,
        depositoId: deposito.id,
        canal: "ORCAMENTO",
        status: "RASCUNHO",
        vendedor: orc.vendedor ?? null,
        vendedorId: orc.vendedorId ?? null,
        condicaoPagamento: orc.condicaoPagamento ?? null,
        subtotal: Number(orc.subtotal),
        desconto: Number(orc.desconto),
        frete: 0,
        total: Number(orc.total),
        origemOrcamentoId: orc.id,
        itens: {
          create: orc.itens.map((item) => {
            const custoUnitario =
              Number(item.produto.custoMedio ?? item.produto.precoCusto ?? 0);
            return {
              ...scopedByTenantCompany(scope),
              produtoId: item.produtoId,
              quantidade: item.quantidade,
              precoUnitario: Number(item.precoUnitario),
              custoUnitario,
              desconto: 0,
              total: Number(item.total),
            };
          }),
        },
      },
      include: { itens: true },
    });

    // Reserva de estoque para os itens do pedido
    for (const item of orc.itens) {
      await reserveStock(tx, scope, {
        produtoId: item.produtoId,
        depositoId: deposito.id,
        quantidade: item.quantidade,
        origemTipo: "PEDIDO_VENDA",
        origemId: pedido.id,
      });
    }

    // Marca orçamento como convertido
    await tx.orcamento.update({
      where: { id },
      data: { status: "CONVERTIDO", pedidoGeradoId: pedido.id },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Orcamento",
      entidadeId: id,
      acao: "CONVERT_TO_PEDIDO",
      payload: { pedidoId: pedido.id, numeroPedido },
    });

    return { orcamento: { id, status: "CONVERTIDO" }, pedido };
  }, TX_OPTIONS);
}

/**
 * EXCLUI (remove) um orçamento — ação ADMIN. Bloqueia se já convertido em pedido (mantém o
 * vínculo). Remove os itens e o orçamento; eventuais pedidos que apontem para ele são desvinculados.
 */
export async function deleteQuote(scope: TenantScope, id: string) {
  const orc = await prisma.orcamento.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    select: { id: true, numero: true, status: true, pedidoGeradoId: true }
  });
  if (!orc) throw new Error("Orçamento não encontrado.");
  if (orc.status === "CONVERTIDO" || orc.pedidoGeradoId) {
    throw new Error("Não é possível excluir um orçamento já convertido em pedido.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.pedidoVenda.updateMany({ where: { origemOrcamentoId: id }, data: { origemOrcamentoId: null } });
    await tx.orcamentoItem.deleteMany({ where: { orcamentoId: id } });
    const removido = await tx.orcamento.delete({ where: { id } });
    await createAuditLog(tx, {
      scope,
      entidade: "Orcamento",
      entidadeId: id,
      acao: "DELETE",
      payload: { numero: orc.numero, statusAnterior: orc.status }
    });
    return removido;
  }, TX_OPTIONS);
}

/**
 * Carrega o orçamento com tudo que o documento imprimível (A4) precisa: emitente (empresa + logo),
 * destinatário (cliente + endereço/contato), itens e condições. Usado pela rota de impressão.
 */
export async function getOrcamentoParaImpressao(scope: TenantScope, id: string) {
  const orcamento = await prisma.orcamento.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: {
      cliente: {
        include: {
          enderecos: { orderBy: { padrao: "desc" } },
          contatos: true
        }
      },
      itens: { include: { produto: { select: { nome: true, sku: true, unidade: true } } } }
    }
  });
  if (!orcamento) throw new Error("Orçamento não encontrado.");

  const empresa = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: {
      razaoSocial: true, nomeFantasia: true, cnpj: true, inscricaoEstadual: true,
      enderecoLogradouro: true, enderecoNumero: true, enderecoBairro: true,
      enderecoCidade: true, enderecoUf: true, enderecoCep: true,
      telefone: true, email: true, logoSistema: true, corDestaque: true
    }
  });

  return { orcamento, empresa };
}
