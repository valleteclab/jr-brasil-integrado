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
import { emitFiscalDocument, previewFiscalDocument } from "@/domains/fiscal/application/fiscal-emission-use-cases";
import { gerarParcelas, rotuloParcela } from "@/lib/finance/condicao-pagamento";
import { criarComissaoVenda, cancelarComissaoPedido } from "./comissao-use-cases";

const TX_OPTIONS = { maxWait: 15000, timeout: 30000 };

export type CreateSaleInput = {
  clienteId?: string | null;
  depositoId?: string;
  canal?: string;
  /** Status inicial do pedido (padrão RASCUNHO; pré-venda de balcão usa AGUARDANDO_PAGAMENTO). */
  statusInicial?: "RASCUNHO" | "AGUARDANDO_PAGAMENTO";
  naturezaOperacao?: string;
  vendedor?: string;
  /** Vendedor cadastrado (gera comissão na confirmação conforme o percentual dele). */
  vendedorId?: string | null;
  condicaoPagamento?: string;
  formaPagamento?: string;
  observacoes?: string;
  observacoesInternas?: string;
  desconto?: number;
  frete?: number;
  /** Reservar estoque na criação (padrão true). A loja cria pedidos a aprovar sem reservar. */
  reservarEstoque?: boolean;
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

    // Vendedor cadastrado: valida e usa o nome dele como rótulo quando não informado.
    let vendedorNome = input.vendedor ?? null;
    if (input.vendedorId) {
      const vendedorCadastrado = await tx.vendedor.findFirst({
        where: { id: input.vendedorId, ...scopedByTenantCompany(scope), ativo: true }
      });
      if (!vendedorCadastrado) throw new Error("Vendedor não encontrado ou inativo.");
      vendedorNome = vendedorNome ?? vendedorCadastrado.nome;
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
        vendedor: vendedorNome,
        vendedorId: input.vendedorId ?? null,
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

    // Reserva estoque para cada item (a loja cria pedidos a aprovar sem reservar).
    if (input.reservarEstoque !== false) {
      for (const item of itensMapped) {
        await reserveStock(tx, scope, {
          produtoId: item.produtoId,
          depositoId,
          quantidade: item.quantidade,
          origemTipo: "PEDIDO_VENDA",
          origemId: pedido.id
        });
      }
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

export type ConfirmSaleOptions = {
  /**
   * Contas a receber geradas na confirmação:
   *  - "AUTO" (padrão): parcelas conforme a condição de pagamento do pedido ("30/60/90",
   *    "à vista"...; sem condição, 1 parcela em 30 dias) — apenas quando há cliente.
   *  - "NENHUMA": não gera contas a receber (ex.: PDV, que recebe à vista no caixa e
   *    trata o crediário por fora).
   */
  contasReceber?: "AUTO" | "NENHUMA";
};

export async function confirmSale(scope: TenantScope, id: string, options?: ConfirmSaleOptions) {
  const pedido = await prisma.pedidoVenda.findFirst({
    where: { id, ...scopedByTenantCompany(scope) }
  });

  if (!pedido) throw new Error("Pedido de venda não encontrado.");
  if (pedido.status !== "RASCUNHO" && pedido.status !== "AGUARDANDO_PAGAMENTO") {
    throw new Error("Somente pedidos em RASCUNHO ou AGUARDANDO_PAGAMENTO podem ser confirmados.");
  }

  const modoContasReceber = options?.contasReceber ?? "AUTO";

  return prisma.$transaction(async (tx) => {
    // Efetiva saída de estoque commitando as reservas
    await commitReservationsAsExit(tx, scope, "PEDIDO_VENDA", id, {
      documentoTipo: "PEDIDO_VENDA",
      documentoId: id
    });

    // Contas a receber conforme a condição de pagamento — apenas quando há cliente
    // identificado (venda anônima de balcão é paga à vista, sem contas a receber).
    if (pedido.clienteId && modoContasReceber === "AUTO") {
      const parcelas = gerarParcelas(Number(pedido.total), pedido.condicaoPagamento);
      for (const parcela of parcelas) {
        await tx.contaReceber.create({
          data: {
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            clienteId: pedido.clienteId,
            pedidoVendaId: pedido.id,
            descricao: `Pedido ${pedido.numero}${rotuloParcela(parcela)}`,
            numeroDocumento: pedido.numero,
            origem: "VENDA",
            formaPagamento: pedido.formaPagamento ?? null,
            vencimento: parcela.vencimento,
            valor: parcela.valor,
            valorPago: 0,
            juros: 0,
            multa: 0,
            descontoBaixa: 0,
            status: "ABERTO"
          }
        });
      }
    }

    // Comissão do vendedor (se houver vendedor cadastrado com percentual > 0).
    await criarComissaoVenda(tx, scope, pedido);

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

/** Carrega o pedido com cliente/endereços e itens/ficha fiscal — base para emitir/pré-visualizar. */
async function loadPedidoParaNota(scope: TenantScope, id: string) {
  return prisma.pedidoVenda.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: {
      cliente: { include: { enderecos: true, contatos: true } },
      itens: { include: { produto: { include: { fiscal: true } } } }
    }
  });
}

type PedidoParaNota = NonNullable<Awaited<ReturnType<typeof loadPedidoParaNota>>>;

/** Monta o documento fiscal normalizado a partir do pedido (compartilhado por emitir/preview). */
function buildDocumentoVenda(pedido: PedidoParaNota, modelo: "NFE" | "NFCE") {
  const clienteDoc: ClienteLike = pedido.cliente ?? {
    razaoSocial: "Consumidor final",
    documento: null,
    inscricaoEstadual: null,
    enderecos: [],
    contatos: []
  };
  return buildDocumentFromPedido({
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
}

/** Espelho fiscal de um pedido de venda: como a NF-e/NFC-e seria emitida, sem emitir. */
export async function previewSaleInvoice(scope: TenantScope, id: string, options?: { modelo?: "NFE" | "NFCE" }) {
  const pedido = await loadPedidoParaNota(scope, id);
  if (!pedido) throw new Error("Pedido de venda não encontrado.");
  const doc = buildDocumentoVenda(pedido, options?.modelo ?? "NFE");
  return previewFiscalDocument(scope, doc);
}

export async function invoiceSale(scope: TenantScope, id: string, options?: { modelo?: "NFE" | "NFCE" }) {
  // Carrega pedido com todos os dados necessários para emissão fiscal
  const pedido = await loadPedidoParaNota(scope, id);

  if (!pedido) throw new Error("Pedido de venda não encontrado.");
  if (pedido.status !== "AGUARDANDO_NOTA") {
    throw new Error("Somente pedidos AGUARDANDO_NOTA podem ser faturados. Confirme o pedido primeiro.");
  }
  const modelo = options?.modelo ?? "NFE";
  // NFC-e (mod 65) admite consumidor anônimo; NF-e (mod 55) exige destinatário identificado.
  if (!pedido.cliente && modelo !== "NFCE") {
    throw new Error("Pedido sem cliente identificado. Para venda a consumidor anônimo, emita NFC-e.");
  }

  // NF-e (mod 55) exige endereço completo do destinatário (a SEFAZ rejeita sem xBairro/UF).
  // Pedidos vindos da loja (cadastro rápido) costumam vir sem endereço — avisa de forma clara
  // em vez de deixar a rejeição técnica do provedor chegar ao usuário.
  if (modelo === "NFE" && pedido.cliente) {
    const end = pedido.cliente.enderecos.find((e) => e.padrao) ?? pedido.cliente.enderecos[0];
    const faltando: string[] = [];
    if (!end?.logradouro?.trim()) faltando.push("logradouro");
    if (!end?.bairro?.trim()) faltando.push("bairro");
    if (!end?.cidade?.trim()) faltando.push("cidade");
    if (!end?.uf?.trim()) faltando.push("UF");
    if (!(end?.cep ?? "").replace(/\D/g, "").match(/^\d{8}$/)) faltando.push("CEP");
    if (faltando.length) {
      throw new Error(
        `Endereço do cliente incompleto para emitir NF-e (faltando: ${faltando.join(", ")}). ` +
          `Complete o cadastro do cliente "${pedido.cliente.razaoSocial}" em Clientes, ou emita NFC-e.`
      );
    }
  }

  // Monta documento fiscal — fora de transação (emitFiscalDocument gerencia suas próprias)
  const doc = buildDocumentoVenda(pedido, modelo);

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
  options: { modelo: "NFE" | "NFCE"; contasReceber?: ConfirmSaleOptions["contasReceber"] }
): Promise<CheckoutResult> {
  const pedido = await createSale(scope, input);
  await confirmSale(scope, pedido.id, { contasReceber: options.contasReceber });

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

    // Cancela a comissão do vendedor ainda não paga
    await cancelarComissaoPedido(tx, scope, id);

    // Cancela retiradas de expedição em aberto (o recibo deixa de valer no balcão)
    await tx.expedicaoRetirada.updateMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, pedidoVendaId: id, status: { in: ["PENDENTE", "PARCIAL"] } },
      data: { status: "CANCELADA" }
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

/**
 * EXCLUI (remove) um pedido de venda — ação ADMIN. Só permite em pedidos RASCUNHO ou CANCELADOS,
 * para não desfazer estoque/financeiro de pedidos ativos (nesses casos, cancele antes). Notas
 * fiscais e movimentos de caixa são apenas DESVINCULADOS (preservados), nunca apagados.
 */
export async function deleteSale(scope: TenantScope, id: string) {
  const pedido = await prisma.pedidoVenda.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: { notasFiscais: { where: { status: "AUTORIZADA" }, select: { id: true } } }
  });
  if (!pedido) throw new Error("Pedido de venda não encontrado.");

  if (pedido.status !== "RASCUNHO" && pedido.status !== "CANCELADO") {
    throw new Error("Só é possível excluir pedidos em RASCUNHO ou CANCELADOS. Cancele o pedido antes de excluir.");
  }
  if (pedido.notasFiscais.length > 0) {
    throw new Error("Há nota fiscal autorizada vinculada. Cancele a nota antes de excluir o pedido.");
  }

  return prisma.$transaction(async (tx) => {
    // Libera reservas de estoque que ainda existam (rascunho).
    await releaseReservations(tx, scope, "PEDIDO_VENDA", id);

    const scoped = { tenantId: scope.tenantId, empresaId: scope.empresaId, pedidoVendaId: id };
    // Preserva notas fiscais e movimentos de caixa: apenas desvincula.
    await tx.notaFiscal.updateMany({ where: scoped, data: { pedidoVendaId: null } });
    await tx.caixaMovimento.updateMany({ where: scoped, data: { pedidoVendaId: null } });
    await tx.contaReceber.updateMany({ where: scoped, data: { pedidoVendaId: null } });
    await tx.comissaoVenda.deleteMany({ where: { pedidoVendaId: id } });
    await tx.expedicaoRetiradaItem.deleteMany({ where: { retirada: { pedidoVendaId: id } } });
    await tx.expedicaoRetirada.deleteMany({ where: { pedidoVendaId: id } });
    await tx.pagamentoVenda.deleteMany({ where: { pedidoVendaId: id } });
    await tx.pedidoVendaItem.deleteMany({ where: { pedidoVendaId: id } });
    const removido = await tx.pedidoVenda.delete({ where: { id } });

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoVenda",
      entidadeId: id,
      acao: "DELETE",
      payload: { numero: pedido.numero, statusAnterior: pedido.status }
    });

    return removido;
  }, TX_OPTIONS);
}
