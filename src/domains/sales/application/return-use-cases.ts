import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { getDefaultDeposito, applyStockMovement } from "@/domains/stock/application/stock-service";
import { buildDocumentFromPedido, type ClienteLike } from "@/domains/fiscal/document-builder";
import { emitFiscalDocument } from "@/domains/fiscal/application/fiscal-emission-use-cases";
import { abaterComissaoPorDevolucao } from "./comissao-use-cases";

const TX_OPTIONS = { maxWait: 15000, timeout: 30000 };
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export type ReturnSaleInput = {
  /** Itens devolvidos (por produto). Quando ausente, devolve tudo o que ainda não foi devolvido. */
  itens?: Array<{ produtoId: string; quantidade: number }>;
  motivo?: string;
};

export type ReturnSaleResult = {
  notaId: string;
  notaNumero: string | null;
  chaveAcesso: string | null;
  valorDevolvido: number;
  /** Quanto foi abatido das parcelas em aberto do contas a receber. */
  abatidoContasReceber: number;
  /** Valor já pago pelo cliente que precisa ser reembolsado por fora (dinheiro/PIX/estorno). */
  reembolsoPendente: number;
  itens: Array<{ produtoId: string; quantidade: number }>;
};

/**
 * Devolução de venda faturada: emite a NF-e de devolução (finalidade DEVOLUCAO, entrada
 * tpNF=0) referenciando a chave da nota original, reentra o estoque pelos custos da venda
 * e abate o valor devolvido das parcelas em aberto do contas a receber (das últimas para
 * as primeiras). O que o cliente já tiver pago além do saldo em aberto fica como
 * "reembolso pendente" para acerto por fora (dinheiro/PIX/estorno de cartão).
 *
 * A devolução de NFC-e (consumidor) também é feita por NF-e de entrada; quando a venda é
 * anônima, o destinatário da NF-e é a própria empresa (devolução de consumidor não
 * identificado).
 */
export async function returnSale(scope: TenantScope, pedidoId: string, input: ReturnSaleInput = {}) {
  const pedido = await prisma.pedidoVenda.findFirst({
    where: { id: pedidoId, ...scopedByTenantCompany(scope) },
    include: {
      cliente: { include: { enderecos: true, contatos: true } },
      itens: { include: { produto: { include: { fiscal: true } } } },
      notasFiscais: {
        select: {
          id: true,
          modelo: true,
          finalidade: true,
          status: true,
          numero: true,
          chaveAcesso: true,
          autorizadaEm: true,
          itens: { select: { produtoId: true, quantidade: true } }
        }
      }
    }
  });

  if (!pedido) throw new Error("Pedido de venda não encontrado.");
  if (pedido.status !== "ENVIADO" && pedido.status !== "ENTREGUE") {
    throw new Error("Somente pedidos faturados (ENVIADO/ENTREGUE) podem receber devolução. Para pedidos não faturados, use o cancelamento.");
  }

  // Nota fiscal original autorizada (a devolução referencia a chave de acesso dela).
  const notaOrigem = pedido.notasFiscais
    .filter((n) => n.finalidade === "NORMAL" && n.status === "AUTORIZADA" && (n.modelo === "NFE" || n.modelo === "NFCE") && n.chaveAcesso)
    .sort((a, b) => (b.autorizadaEm?.getTime() ?? 0) - (a.autorizadaEm?.getTime() ?? 0))[0];
  if (!notaOrigem) {
    throw new Error("O pedido não tem NF-e/NFC-e autorizada com chave de acesso — não é possível emitir a devolução.");
  }

  // Quantidades vendidas e já devolvidas por produto. Devoluções em PROCESSANDO contam
  // como devolvidas para não permitir devolver duas vezes enquanto a SEFAZ responde.
  const vendidoPorProduto = new Map<string, number>();
  for (const item of pedido.itens) {
    vendidoPorProduto.set(item.produtoId, (vendidoPorProduto.get(item.produtoId) ?? 0) + Number(item.quantidade));
  }
  const devolvidoPorProduto = new Map<string, number>();
  for (const nota of pedido.notasFiscais) {
    if (nota.finalidade !== "DEVOLUCAO") continue;
    if (nota.status !== "AUTORIZADA" && nota.status !== "PROCESSANDO") continue;
    for (const item of nota.itens) {
      if (!item.produtoId) continue;
      devolvidoPorProduto.set(item.produtoId, (devolvidoPorProduto.get(item.produtoId) ?? 0) + Number(item.quantidade));
    }
  }

  // Itens a devolver: os informados, ou tudo o que resta.
  let solicitados: Array<{ produtoId: string; quantidade: number }>;
  if (input.itens && input.itens.length > 0) {
    solicitados = input.itens.map((i) => ({ produtoId: i.produtoId, quantidade: Math.floor(Number(i.quantidade)) }));
  } else {
    solicitados = Array.from(vendidoPorProduto.entries())
      .map(([produtoId, vendido]) => ({ produtoId, quantidade: vendido - (devolvidoPorProduto.get(produtoId) ?? 0) }))
      .filter((i) => i.quantidade > 0);
  }
  if (solicitados.length === 0) {
    throw new Error("Nada a devolver: todos os itens do pedido já foram devolvidos.");
  }

  // Valida quantidades e monta as linhas da nota com preço líquido médio do item na venda.
  type LinhaDevolucao = {
    produto: (typeof pedido.itens)[number]["produto"];
    quantidade: number;
    precoUnitarioLiquido: number;
    custoUnitario: number;
  };
  const linhas: LinhaDevolucao[] = [];
  for (const solicitado of solicitados) {
    const vendido = vendidoPorProduto.get(solicitado.produtoId);
    if (!vendido) throw new Error("Item devolvido não pertence ao pedido.");
    if (!Number.isFinite(solicitado.quantidade) || solicitado.quantidade <= 0) {
      throw new Error("Quantidade a devolver deve ser maior que zero.");
    }
    const restante = vendido - (devolvidoPorProduto.get(solicitado.produtoId) ?? 0);
    const itensProduto = pedido.itens.filter((i) => i.produtoId === solicitado.produtoId);
    const nomeProduto = itensProduto[0].produto.nome;
    if (solicitado.quantidade > restante) {
      throw new Error(`"${nomeProduto}": quantidade a devolver (${solicitado.quantidade}) maior que o restante devolvível (${restante}).`);
    }
    // Preço líquido médio (total da linha já desconta o desconto por item) e custo médio da venda.
    const qtdTotal = itensProduto.reduce((s, i) => s + Number(i.quantidade), 0);
    const valorTotal = itensProduto.reduce((s, i) => s + Number(i.total), 0);
    const custoMedio = itensProduto.reduce((s, i) => s + Number(i.custoUnitario) * Number(i.quantidade), 0) / qtdTotal;
    linhas.push({
      produto: itensProduto[0].produto,
      quantidade: solicitado.quantidade,
      precoUnitarioLiquido: round2(valorTotal / qtdTotal),
      custoUnitario: custoMedio,
    });
  }

  // Desconto global proporcional ao valor devolvido (frete não é devolvido).
  const subtotalDevolvido = round2(linhas.reduce((s, l) => s + l.quantidade * l.precoUnitarioLiquido, 0));
  const subtotalPedido = Number(pedido.subtotal);
  const descontoGlobal = Number(pedido.desconto);
  const descontoProporcional = subtotalPedido > 0 ? round2(descontoGlobal * (subtotalDevolvido / subtotalPedido)) : 0;

  // Destinatário: o cliente da venda; venda anônima (NFC-e) → a própria empresa
  // (devolução de consumidor não identificado é NF-e de entrada contra o próprio CNPJ).
  let clienteDoc: ClienteLike;
  if (pedido.cliente) {
    clienteDoc = pedido.cliente;
  } else {
    const empresa = await prisma.empresa.findFirst({ where: { id: scope.empresaId, tenantId: scope.tenantId } });
    if (!empresa) throw new Error("Empresa não encontrada.");
    clienteDoc = {
      razaoSocial: empresa.razaoSocial,
      documento: empresa.cnpj,
      inscricaoEstadual: empresa.inscricaoEstadual,
      enderecos: [{
        uf: empresa.enderecoUf ?? "",
        padrao: true,
        logradouro: empresa.enderecoLogradouro,
        numero: empresa.enderecoNumero,
        complemento: empresa.enderecoComplemento,
        bairro: empresa.enderecoBairro,
        cep: empresa.enderecoCep,
        cidade: empresa.enderecoCidade,
        codigoMunicipioIbge: empresa.codigoMunicipioIbge
      }],
      contatos: empresa.email ? [{ email: empresa.email, principal: true }] : []
    };
  }

  const motivo = input.motivo?.trim() || null;
  const doc = buildDocumentFromPedido({
    cliente: clienteDoc,
    modelo: "NFE",
    finalidade: "DEVOLUCAO",
    naturezaOperacao: "Devolução de venda",
    chaveReferenciada: notaOrigem.chaveAcesso,
    formaPagamento: "Sem pagamento",
    observacoes: [
      `Devolução referente à ${notaOrigem.modelo === "NFCE" ? "NFC-e" : "NF-e"} ${notaOrigem.numero ?? ""} (pedido ${pedido.numero}).`,
      motivo ? `Motivo: ${motivo}.` : null
    ].filter(Boolean).join(" "),
    desconto: descontoProporcional,
    itens: linhas.map((linha) => ({
      produto: {
        id: linha.produto.id,
        sku: linha.produto.sku,
        nome: linha.produto.nome,
        ncm: linha.produto.ncm,
        cest: linha.produto.cest,
        cfop: linha.produto.cfop,
        origem: linha.produto.origem,
        unidade: linha.produto.unidade,
        fiscal: linha.produto.fiscal
          ? {
              ncm: linha.produto.fiscal.ncm,
              cest: linha.produto.fiscal.cest,
              origem: linha.produto.fiscal.origem,
              regraTributariaId: linha.produto.fiscal.regraTributariaId,
              icmsSt: linha.produto.fiscal.icmsSt
            }
          : null
      },
      quantidade: linha.quantidade,
      precoUnitario: linha.precoUnitarioLiquido,
      desconto: 0
    }))
  });

  // Emite a NF-e de devolução (gerencia as próprias transações; rejeição fica registrada).
  const nota = await emitFiscalDocument(scope, doc, {
    clienteId: pedido.clienteId,
    pedidoVendaId: pedido.id,
    notaOrigemId: notaOrigem.id
  });
  if (nota.status !== "AUTORIZADA") {
    throw new Error(nota.motivo ?? "A NF-e de devolução não foi autorizada. Nenhum estoque ou financeiro foi alterado.");
  }

  const valorDevolvido = Number(nota.total);

  // Nota autorizada → efeitos: reentrada de estoque + abatimento do contas a receber.
  return prisma.$transaction(async (tx) => {
    const depositoId = pedido.depositoId ?? (await getDefaultDeposito(tx, scope)).id;

    for (const linha of linhas) {
      await applyStockMovement(tx, scope, {
        produtoId: linha.produto.id,
        depositoId,
        tipo: "ENTRADA",
        quantidade: linha.quantidade,
        custoUnitario: linha.custoUnitario,
        documentoTipo: "DEVOLUCAO_VENDA",
        documentoId: nota.id,
        observacoes: `Devolução do pedido ${pedido.numero} — NF-e ${nota.numero ?? nota.id}`
      });
    }

    // Abate o valor devolvido das parcelas em aberto, das últimas para as primeiras.
    const parcelasAbertas = await tx.contaReceber.findMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        pedidoVendaId: pedido.id,
        status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] }
      },
      orderBy: { vencimento: "desc" }
    });

    let restante = valorDevolvido;
    for (const parcela of parcelasAbertas) {
      if (restante <= 0.005) break;
      const valor = Number(parcela.valor);
      const valorPago = Number(parcela.valorPago);
      const saldo = round2(valor - valorPago);
      if (saldo <= 0) continue;
      const abate = Math.min(saldo, restante);
      const novoValor = round2(valor - abate);
      const quitada = novoValor <= valorPago + 0.005;
      await tx.contaReceber.update({
        where: { id: parcela.id },
        data: {
          valor: novoValor,
          status: quitada ? (valorPago > 0 ? "PAGO" : "CANCELADO") : parcela.status,
          ...(quitada && valorPago > 0 ? { pagoEm: new Date() } : {}),
          observacoes: [parcela.observacoes, `Abatido ${abate.toFixed(2)} pela devolução NF-e ${nota.numero ?? nota.id}.`]
            .filter(Boolean)
            .join(" ")
        }
      });
      restante = round2(restante - abate);
    }

    const abatido = round2(valorDevolvido - restante);

    // Comissão do vendedor: abate proporcional ao valor devolvido (se ainda não paga).
    const totalPedido = Number(pedido.total);
    if (totalPedido > 0) {
      await abaterComissaoPorDevolucao(tx, scope, pedido.id, valorDevolvido / totalPedido, `NF-e ${nota.numero ?? nota.id}`);
    }

    await createAuditLog(tx, {
      scope,
      entidade: "PedidoVenda",
      entidadeId: pedido.id,
      acao: "RETURN",
      payload: {
        numero: pedido.numero,
        notaDevolucaoId: nota.id,
        notaOrigemId: notaOrigem.id,
        valorDevolvido,
        abatidoContasReceber: abatido,
        itens: linhas.map((l) => ({ produtoId: l.produto.id, quantidade: l.quantidade }))
      }
    });

    const result: ReturnSaleResult = {
      notaId: nota.id,
      notaNumero: nota.numero ?? null,
      chaveAcesso: nota.chaveAcesso ?? null,
      valorDevolvido,
      abatidoContasReceber: abatido,
      reembolsoPendente: restante,
      itens: linhas.map((l) => ({ produtoId: l.produto.id, quantidade: l.quantidade }))
    };
    return result;
  }, TX_OPTIONS);
}
