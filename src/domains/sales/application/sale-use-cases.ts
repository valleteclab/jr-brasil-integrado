import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  getDefaultDeposito,
  reserveStock,
  releaseReservations,
  commitReservationsAsExit,
  applyStockMovement
} from "@/domains/stock/application/stock-service";
import { buildDocumentFromPedido, type ClienteLike } from "@/domains/fiscal/document-builder";
import { emitFiscalDocument } from "@/domains/fiscal/application/fiscal-emission-use-cases";

const TX_OPTIONS = { maxWait: 15000, timeout: 30000 };

export type CreateSaleInput = {
  clienteId?: string | null;
  depositoId?: string;
  canal?: string;
  /** Status inicial do pedido (padrão RASCUNHO; pré-venda de balcão usa AGUARDANDO_PAGAMENTO). */
  statusInicial?: "RASCUNHO" | "AGUARDANDO_PAGAMENTO";
  naturezaOperacao?: string;
  vendedor?: string;
  condicaoPagamento?: string;
  formaPagamento?: string;
  observacoes?: string;
  observacoesInternas?: string;
  desconto?: number;
  frete?: number;
  itens: Array<{
    produtoId: string;
    quantidade: number;
    precoUnitario: number;
    desconto?: number;
  }>;
};

export async function createSale(scope: TenantScope, input: CreateSaleInput) {
  if (!input.itens || input.itens.length === 0) throw new Error("Pedido deve ter ao menos um item.");

  return prisma.$transaction(async (tx) => {
    const numero = await nextDocumentNumber(tx.pedidoVenda, scope, "PV");

    // Deposito: usa o informado ou resolve o padrão
    let depositoId = input.depositoId;
    if (!depositoId) {
      const dep = await getDefaultDeposito(tx, scope);
      depositoId = dep.id;
    }

    // Carrega produtos para custo médio
    const produtoIds = input.itens.map((i) => i.produtoId);
    const produtos = await tx.produto.findMany({
      where: { id: { in: produtoIds }, ...scopedByTenantCompany(scope), ativo: true },
      select: { id: true, custoMedio: true, precoCusto: true }
    });
    const custoMap = new Map(produtos.map((p) => [p.id, Number(p.custoMedio ?? p.precoCusto ?? 0)]));

    // Monta itens
    const descontoGlobal = input.desconto ?? 0;
    const freteGlobal = input.frete ?? 0;

    const itensMapped = input.itens.map((item) => {
      const descItem = item.desconto ?? 0;
      const total = item.quantidade * item.precoUnitario - descItem;
      return {
        ...item,
        desconto: descItem,
        custoUnitario: custoMap.get(item.produtoId) ?? 0,
        total
      };
    });

    const subtotal = itensMapped.reduce((sum, i) => sum + i.total, 0);
    const total = subtotal - descontoGlobal + freteGlobal;

    const pedido = await tx.pedidoVenda.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        numero,
        clienteId: input.clienteId ?? null,
        depositoId,
        canal: input.canal ?? "BALCAO",
        status: input.statusInicial ?? "RASCUNHO",
        naturezaOperacao: input.naturezaOperacao ?? null,
        vendedor: input.vendedor ?? null,
        condicaoPagamento: input.condicaoPagamento ?? null,
        formaPagamento: input.formaPagamento ?? null,
        observacoes: input.observacoes ?? null,
        observacoesInternas: input.observacoesInternas ?? null,
        desconto: descontoGlobal,
        frete: freteGlobal,
        subtotal,
        total,
        itens: {
          create: itensMapped.map((item) => ({
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            custoUnitario: item.custoUnitario,
            desconto: item.desconto,
            total: item.total
          }))
        }
      }
    });

    // Reserva estoque para cada item
    for (const item of itensMapped) {
      await reserveStock(tx, scope, {
        produtoId: item.produtoId,
        depositoId,
        quantidade: item.quantidade,
        origemTipo: "PEDIDO_VENDA",
        origemId: pedido.id
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoVenda",
      entidadeId: pedido.id,
      acao: "CREATE",
      payload: { numero, clienteId: input.clienteId, total, itens: itensMapped.length }
    });

    return pedido;
  }, TX_OPTIONS);
}

export async function confirmSale(scope: TenantScope, id: string) {
  const pedido = await prisma.pedidoVenda.findFirst({
    where: { id, ...scopedByTenantCompany(scope) }
  });

  if (!pedido) throw new Error("Pedido de venda não encontrado.");
  if (pedido.status !== "RASCUNHO" && pedido.status !== "AGUARDANDO_PAGAMENTO") {
    throw new Error("Somente pedidos em RASCUNHO ou AGUARDANDO_PAGAMENTO podem ser confirmados.");
  }

  return prisma.$transaction(async (tx) => {
    // Efetiva saída de estoque commitando as reservas
    await commitReservationsAsExit(tx, scope, "PEDIDO_VENDA", id, {
      documentoTipo: "PEDIDO_VENDA",
      documentoId: id
    });

    // Cria ContaReceber (1 parcela, vencimento +30 dias) — apenas quando há cliente
    // identificado (venda anônima de balcão é paga à vista, sem contas a receber).
    if (pedido.clienteId) {
      const vencimento = new Date();
      vencimento.setDate(vencimento.getDate() + 30);

      await tx.contaReceber.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          clienteId: pedido.clienteId,
          pedidoVendaId: pedido.id,
          descricao: `Pedido ${pedido.numero}`,
          numeroDocumento: pedido.numero,
          origem: "VENDA",
          formaPagamento: pedido.formaPagamento ?? null,
          vencimento,
          valor: pedido.total,
          valorPago: 0,
          juros: 0,
          multa: 0,
          descontoBaixa: 0,
          status: "ABERTO"
        }
      });
    }

    const updated = await tx.pedidoVenda.update({
      where: { id },
      data: {
        status: "AGUARDANDO_NOTA",
        confirmadoEm: new Date()
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoVenda",
      entidadeId: id,
      acao: "CONFIRM",
      payload: { status: "AGUARDANDO_NOTA", numero: pedido.numero }
    });

    return updated;
  }, TX_OPTIONS);
}

export async function invoiceSale(scope: TenantScope, id: string, options?: { modelo?: "NFE" | "NFCE" }) {
  // Carrega pedido com todos os dados necessários para emissão fiscal
  const pedido = await prisma.pedidoVenda.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: {
      cliente: {
        include: {
          enderecos: true,
          contatos: true
        }
      },
      itens: {
        include: {
          produto: {
            include: {
              fiscal: true
            }
          }
        }
      }
    }
  });

  if (!pedido) throw new Error("Pedido de venda não encontrado.");
  if (pedido.status !== "AGUARDANDO_NOTA") {
    throw new Error("Somente pedidos AGUARDANDO_NOTA podem ser faturados. Confirme o pedido primeiro.");
  }
  const modelo = options?.modelo ?? "NFE";
  // NFC-e (mod 65) admite consumidor anônimo; NF-e (mod 55) exige destinatário identificado.
  if (!pedido.cliente && modelo !== "NFCE") {
    throw new Error("Pedido sem cliente identificado. Para venda a consumidor anônimo, emita NFC-e.");
  }
  const clienteDoc: ClienteLike = pedido.cliente ?? {
    razaoSocial: "Consumidor final",
    documento: null,
    inscricaoEstadual: null,
    enderecos: [],
    contatos: []
  };

  // Monta documento fiscal — fora de transação (emitFiscalDocument gerencia suas próprias)
  const doc = buildDocumentFromPedido({
    cliente: clienteDoc,
    formaPagamento: pedido.formaPagamento,
    condicaoPagamento: pedido.condicaoPagamento,
    observacoes: pedido.observacoes,
    frete: Number(pedido.frete),
    desconto: Number(pedido.desconto),
    modelo,
    itens: pedido.itens.map((item) => ({
      produto: {
        id: item.produto.id,
        sku: item.produto.sku,
        nome: item.produto.nome,
        ncm: item.produto.ncm,
        cest: item.produto.cest,
        cfop: item.produto.cfop,
        origem: item.produto.origem,
        unidade: item.produto.unidade,
        fiscal: item.produto.fiscal
          ? {
              ncm: item.produto.fiscal.ncm,
              cest: item.produto.fiscal.cest,
              origem: item.produto.fiscal.origem,
              regraTributariaId: item.produto.fiscal.regraTributariaId,
              icmsSt: item.produto.fiscal.icmsSt
            }
          : null
      },
      quantidade: item.quantidade,
      precoUnitario: Number(item.precoUnitario),
      desconto: Number(item.desconto)
    }))
  });

  // Emite a nota fiscal (gerencia suas próprias transações)
  const nota = await emitFiscalDocument(scope, doc, {
    clienteId: pedido.clienteId,
    pedidoVendaId: id
  });

  if (nota.status !== "AUTORIZADA") {
    throw new Error(nota.motivo ?? "Nota fiscal não foi autorizada.");
  }

  // Atualiza pedido e ContaReceber em transação separada após retorno
  await prisma.$transaction(async (tx) => {
    await tx.pedidoVenda.update({
      where: { id },
      data: {
        status: "ENVIADO",
        faturadoEm: new Date()
      }
    });

    // Vincula ContaReceber à NotaFiscal
    await tx.contaReceber.updateMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        pedidoVendaId: id,
        status: "ABERTO"
      },
      data: { notaFiscalId: nota.id }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoVenda",
      entidadeId: id,
      acao: "INVOICE",
      payload: { notaFiscalId: nota.id, status: nota.status, numero: pedido.numero }
    });
  }, TX_OPTIONS);

  return nota;
}

export type CheckoutResult = {
  pedidoId: string;
  pedidoNumero: string;
  pedidoStatus: string;
  nota: {
    id: string;
    status: string;
    numero: string | null;
    chaveAcesso: string | null;
    motivo: string | null;
  } | null;
  /** Mensagem quando a emissão falhou — a venda continua registrada/confirmada. */
  emitErro: string | null;
};

/**
 * Checkout de balcão em um clique: cria o pedido, confirma (baixa estoque + conta a receber)
 * e emite a nota fiscal (NFC-e/NF-e). Se a emissão falhar (rejeição/erro), a venda permanece
 * confirmada (AGUARDANDO_NOTA) com a nota rejeitada registrada — o usuário reemite em Vendas
 * sem refazer a venda.
 */
export async function checkoutSale(
  scope: TenantScope,
  input: CreateSaleInput,
  options: { modelo: "NFE" | "NFCE" }
): Promise<CheckoutResult> {
  const pedido = await createSale(scope, input);
  await confirmSale(scope, pedido.id);

  try {
    const nota = await invoiceSale(scope, pedido.id, { modelo: options.modelo });
    return {
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      pedidoStatus: "ENVIADO",
      nota: {
        id: nota.id,
        status: nota.status,
        numero: nota.numero ?? null,
        chaveAcesso: nota.chaveAcesso ?? null,
        motivo: nota.motivo ?? null
      },
      emitErro: null
    };
  } catch (error) {
    // A venda já está confirmada; a nota rejeitada (se houver) ficou registrada e vinculada.
    const notaRejeitada = await prisma.notaFiscal.findFirst({
      where: { pedidoVendaId: pedido.id, ...scopedByTenantCompany(scope) },
      orderBy: { criadoEm: "desc" }
    });
    return {
      pedidoId: pedido.id,
      pedidoNumero: pedido.numero,
      pedidoStatus: "AGUARDANDO_NOTA",
      nota: notaRejeitada
        ? {
            id: notaRejeitada.id,
            status: notaRejeitada.status,
            numero: notaRejeitada.numero ?? null,
            chaveAcesso: notaRejeitada.chaveAcesso ?? null,
            motivo: notaRejeitada.motivo ?? null
          }
        : null,
      emitErro: error instanceof Error ? error.message : "Não foi possível emitir a nota fiscal."
    };
  }
}

export async function cancelSale(scope: TenantScope, id: string) {
  const pedido = await prisma.pedidoVenda.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: {
      itens: true,
      notasFiscais: { where: { status: "AUTORIZADA" } }
    }
  });

  if (!pedido) throw new Error("Pedido de venda não encontrado.");

  if (pedido.status === "CANCELADO") throw new Error("O pedido já está cancelado.");

  // Bloqueia se houver NF-e autorizada
  if (pedido.notasFiscais.length > 0) {
    throw new Error(
      "Não é possível cancelar este pedido pois há nota fiscal autorizada vinculada. Cancele a nota fiscal antes de cancelar o pedido."
    );
  }

  return prisma.$transaction(async (tx) => {
    const statusFaturados = ["ENVIADO", "ENTREGUE"];
    const jaFaturado = statusFaturados.includes(pedido.status);

    if (jaFaturado) {
      // Estorno de estoque por item
      const depositoId =
        pedido.depositoId ??
        (await getDefaultDeposito(tx, scope)).id;

      for (const item of pedido.itens) {
        await applyStockMovement(tx, scope, {
          produtoId: item.produtoId,
          depositoId,
          tipo: "ESTORNO",
          quantidade: item.quantidade,
          documentoTipo: "PEDIDO_VENDA",
          documentoId: id,
          observacoes: `Estorno por cancelamento do pedido ${pedido.numero}`
        });
      }
    } else {
      // Libera reservas se ainda não baixou estoque
      await releaseReservations(tx, scope, "PEDIDO_VENDA", id);
    }

    // Cancela ContaReceber abertas
    await tx.contaReceber.updateMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        pedidoVendaId: id,
        status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] }
      },
      data: { status: "CANCELADO" }
    });

    const updated = await tx.pedidoVenda.update({
      where: { id },
      data: {
        status: "CANCELADO",
        canceladoEm: new Date()
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoVenda",
      entidadeId: id,
      acao: "CANCEL",
      payload: { numero: pedido.numero, statusAnterior: pedido.status }
    });

    return updated;
  }, TX_OPTIONS);
}
