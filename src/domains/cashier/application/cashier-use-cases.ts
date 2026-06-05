import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { commitReservationsAsExit } from "@/domains/stock/application/stock-service";
import { buildDocumentFromPedido } from "@/domains/fiscal/document-builder";
import { emitFiscalDocument } from "@/domains/fiscal/application/fiscal-emission-use-cases";

/**
 * Caixa (PDV) — turno do operador, movimentos de dinheiro e recebimento de pré-vendas.
 *
 * Fluxo: abrirCaixa (fundo de troco) → recebe VENDAs, SUPRIMENTOs (entradas) e SANGRIAs
 * (retiradas) → fecharCaixa (contagem informada conferida contra o esperado em dinheiro).
 * O "esperado em dinheiro" considera só movimentos em espécie; as demais formas (pix/cartão)
 * são registradas para o relatório de fechamento.
 */

export class CaixaError extends Error {}

const FORMA_DINHEIRO = "DINHEIRO";
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Caixa aberto da empresa — no máximo um por vez. */
export async function getCaixaAberto(scope: TenantScope) {
  return prisma.caixa.findFirst({
    where: { ...scopedByTenantCompany(scope), status: "ABERTO" },
    orderBy: { abertoEm: "desc" }
  });
}

async function getCaixaAbertoOrThrow(scope: TenantScope) {
  const caixa = await getCaixaAberto(scope);
  if (!caixa) throw new CaixaError("Nenhum caixa aberto. Abra o caixa para operar.");
  return caixa;
}

export async function abrirCaixa(
  scope: TenantScope,
  input: { operador: string; saldoInicial?: number; observacao?: string }
) {
  const operador = input.operador?.trim();
  if (!operador) throw new CaixaError("Informe o operador do caixa.");

  const existente = await getCaixaAberto(scope);
  if (existente) throw new CaixaError("Já existe um caixa aberto. Feche-o antes de abrir outro.");

  const saldoInicial = Math.max(0, Number(input.saldoInicial) || 0);

  return prisma.$transaction(async (tx) => {
    const caixa = await tx.caixa.create({
      data: {
        ...scopedByTenantCompany(scope),
        operador,
        status: "ABERTO",
        saldoInicial,
        observacaoAbertura: input.observacao?.trim() || null
      }
    });
    if (saldoInicial > 0) {
      await tx.caixaMovimento.create({
        data: {
          ...scopedByTenantCompany(scope),
          caixaId: caixa.id,
          tipo: "ABERTURA",
          formaPagamento: FORMA_DINHEIRO,
          valor: saldoInicial,
          descricao: "Saldo inicial (fundo de troco)"
        }
      });
    }
    await createAuditLog(tx, { scope, entidade: "Caixa", entidadeId: caixa.id, acao: "ABRIR", payload: { operador, saldoInicial } });
    return caixa;
  });
}

/**
 * Registra o recebimento de uma venda do PDV no caixa aberto: cria os PagamentoVenda (quando há
 * pedido de produtos) e os movimentos de caixa (VENDA) por forma, com o troco descontado do
 * dinheiro. Calcula e devolve o troco. Use após emitir as notas, com o total geral (produtos +
 * serviços) que o cliente pagou.
 */
export async function registrarRecebimentoPdv(
  scope: TenantScope,
  input: {
    pedidoVendaId: string | null;
    descricao: string;
    total: number;
    pagamentos: Array<{ forma: string; valor: number }>;
  }
): Promise<{ troco: number; caixaId: string }> {
  const caixa = await getCaixaAbertoOrThrow(scope);

  const pagamentos = (input.pagamentos ?? []).filter((p) => Number(p.valor) > 0);
  if (!pagamentos.length) throw new CaixaError("Informe ao menos uma forma de pagamento.");

  const total = round2(input.total);
  const somaPago = round2(pagamentos.reduce((s, p) => s + Number(p.valor), 0));
  if (somaPago + 0.0001 < total) {
    throw new CaixaError(`Pagamento insuficiente: total ${total.toFixed(2)}, recebido ${somaPago.toFixed(2)}.`);
  }
  const troco = round2(somaPago - total);

  // Valores líquidos por forma (somam exatamente o total): o troco sai do dinheiro.
  const brutoPorForma = new Map<string, number>();
  for (const p of pagamentos) brutoPorForma.set(p.forma, (brutoPorForma.get(p.forma) ?? 0) + Number(p.valor));
  const liquidoPorForma: Array<{ forma: string; valor: number }> = [];
  for (const [forma, valor] of brutoPorForma) {
    const liquido = forma === FORMA_DINHEIRO ? round2(valor - troco) : round2(valor);
    if (liquido > 0) liquidoPorForma.push({ forma, valor: liquido });
  }

  await prisma.$transaction(async (tx) => {
    if (input.pedidoVendaId) {
      for (const p of pagamentos) {
        await tx.pagamentoVenda.create({
          data: {
            ...scopedByTenantCompany(scope),
            pedidoVendaId: input.pedidoVendaId,
            forma: p.forma,
            valor: round2(Number(p.valor)),
            troco: p.forma === FORMA_DINHEIRO ? troco : 0
          }
        });
      }
    }
    for (const m of liquidoPorForma) {
      await tx.caixaMovimento.create({
        data: {
          ...scopedByTenantCompany(scope),
          caixaId: caixa.id,
          tipo: "VENDA",
          formaPagamento: m.forma,
          valor: m.valor,
          pedidoVendaId: input.pedidoVendaId ?? undefined,
          descricao: input.descricao
        }
      });
    }
  });

  return { troco, caixaId: caixa.id };
}

/** Suprimento (entrada de dinheiro) ou Sangria (retirada). */
export async function registrarMovimentoCaixa(
  scope: TenantScope,
  input: { tipo: "SUPRIMENTO" | "SANGRIA"; valor: number; descricao?: string }
) {
  const valor = Number(input.valor) || 0;
  if (valor <= 0) throw new CaixaError("Informe um valor maior que zero.");
  const caixa = await getCaixaAbertoOrThrow(scope);

  return prisma.caixaMovimento.create({
    data: {
      ...scopedByTenantCompany(scope),
      caixaId: caixa.id,
      tipo: input.tipo,
      formaPagamento: FORMA_DINHEIRO,
      // Sangria sai do caixa (negativo); suprimento entra (positivo).
      valor: input.tipo === "SANGRIA" ? -Math.abs(valor) : Math.abs(valor),
      descricao: input.descricao?.trim() || (input.tipo === "SANGRIA" ? "Sangria" : "Suprimento")
    }
  });
}

export type ResumoCaixa = {
  id: string;
  operador: string;
  abertoEm: string;
  saldoInicial: number;
  totalVendas: number;
  totalSuprimentos: number;
  totalSangrias: number;
  /** Esperado em dinheiro na gaveta = abertura + vendas em dinheiro + suprimentos − sangrias. */
  esperadoDinheiro: number;
  porForma: Array<{ forma: string; valor: number }>;
  qtdVendas: number;
};

export async function getResumoCaixa(scope: TenantScope, caixaId: string): Promise<ResumoCaixa> {
  const caixa = await prisma.caixa.findFirst({
    where: { id: caixaId, ...scopedByTenantCompany(scope) },
    include: { movimentos: true }
  });
  if (!caixa) throw new CaixaError("Caixa não encontrado.");

  const porFormaMap = new Map<string, number>();
  let totalVendas = 0;
  let totalSuprimentos = 0;
  let totalSangrias = 0;
  let dinheiroVendas = 0;
  const vendasIds = new Set<string>();

  for (const m of caixa.movimentos) {
    const valor = Number(m.valor);
    const forma = m.formaPagamento ?? "OUTRO";
    if (m.tipo === "VENDA") {
      totalVendas += valor;
      porFormaMap.set(forma, (porFormaMap.get(forma) ?? 0) + valor);
      if (forma === FORMA_DINHEIRO) dinheiroVendas += valor;
      if (m.pedidoVendaId) vendasIds.add(m.pedidoVendaId);
    } else if (m.tipo === "SUPRIMENTO") {
      totalSuprimentos += valor;
    } else if (m.tipo === "SANGRIA") {
      totalSangrias += Math.abs(valor);
    }
  }

  const saldoInicial = Number(caixa.saldoInicial);
  return {
    id: caixa.id,
    operador: caixa.operador,
    abertoEm: caixa.abertoEm.toISOString(),
    saldoInicial,
    totalVendas: round2(totalVendas),
    totalSuprimentos: round2(totalSuprimentos),
    totalSangrias: round2(totalSangrias),
    esperadoDinheiro: round2(saldoInicial + dinheiroVendas + totalSuprimentos - totalSangrias),
    porForma: Array.from(porFormaMap.entries()).map(([forma, valor]) => ({ forma, valor: round2(valor) })),
    qtdVendas: vendasIds.size
  };
}

export async function fecharCaixa(
  scope: TenantScope,
  input: { saldoFinalInformado?: number; observacao?: string }
) {
  const caixa = await getCaixaAbertoOrThrow(scope);
  const resumo = await getResumoCaixa(scope, caixa.id);

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.caixa.update({
      where: { id: caixa.id },
      data: {
        status: "FECHADO",
        fechadoEm: new Date(),
        saldoFinalInformado: input.saldoFinalInformado != null ? Math.max(0, Number(input.saldoFinalInformado)) : null,
        observacaoFechamento: input.observacao?.trim() || null
      }
    });
    await createAuditLog(tx, {
      scope, entidade: "Caixa", entidadeId: caixa.id, acao: "FECHAR",
      payload: { esperadoDinheiro: resumo.esperadoDinheiro, informado: input.saldoFinalInformado ?? null }
    });
    return c;
  });

  const informado = updated.saldoFinalInformado != null ? Number(updated.saldoFinalInformado) : null;
  return {
    resumo,
    diferenca: informado != null ? round2(informado - resumo.esperadoDinheiro) : null
  };
}

// ---------------------------------------------------------------------------
// Recebimento + emissão no caixa (pré-venda → pagamento → NFC-e/NF-e)
// ---------------------------------------------------------------------------

export type ReceberPagamentoInput = {
  pedidoId: string;
  modelo: "NFE" | "NFCE";
  pagamentos: Array<{ forma: string; valor: number }>;
};

export type ReceberPagamentoResult = {
  pedidoId: string;
  pedidoNumero: string;
  troco: number;
  nota: { id: string; status: string; numero: string | null; chaveAcesso: string | null; motivo: string | null } | null;
  emitErro: string | null;
};

/**
 * No caixa: recebe o pagamento de uma pré-venda (AGUARDANDO_PAGAMENTO), baixa o estoque,
 * registra o(s) pagamento(s) e o movimento de caixa, e emite a NFC-e/NF-e. Se a emissão
 * falhar, o recebimento/caixa permanecem registrados e a venda fica pronta para reemissão.
 */
export async function receberPagamentoEEmitir(
  scope: TenantScope,
  input: ReceberPagamentoInput
): Promise<ReceberPagamentoResult> {
  const caixa = await getCaixaAbertoOrThrow(scope);

  const pedido = await prisma.pedidoVenda.findFirst({
    where: { id: input.pedidoId, ...scopedByTenantCompany(scope) },
    include: {
      cliente: { include: { enderecos: true, contatos: true } },
      itens: { include: { produto: { include: { fiscal: true } } } }
    }
  });
  if (!pedido) throw new CaixaError("Pré-venda não encontrada.");
  if (pedido.status !== "AGUARDANDO_PAGAMENTO") {
    throw new CaixaError("Esta venda não está aguardando pagamento (já recebida ou cancelada).");
  }
  if (input.modelo === "NFE" && !pedido.clienteId) {
    throw new CaixaError("NF-e (modelo 55) exige um cliente identificado. Use NFC-e para consumidor anônimo.");
  }

  const pagamentos = (input.pagamentos ?? []).filter((p) => Number(p.valor) > 0);
  if (!pagamentos.length) throw new CaixaError("Informe ao menos uma forma de pagamento.");

  const total = Number(pedido.total);
  const somaPago = round2(pagamentos.reduce((s, p) => s + Number(p.valor), 0));
  if (somaPago + 0.0001 < total) {
    throw new CaixaError(`Pagamento insuficiente: total ${total.toFixed(2)}, recebido ${somaPago.toFixed(2)}.`);
  }
  const troco = round2(somaPago - total);

  // Valores líquidos por forma (somam exatamente o total): o troco sai do dinheiro.
  const brutoPorForma = new Map<string, number>();
  for (const p of pagamentos) brutoPorForma.set(p.forma, (brutoPorForma.get(p.forma) ?? 0) + Number(p.valor));
  const liquidoPorForma: Array<{ forma: string; valor: number }> = [];
  for (const [forma, valor] of brutoPorForma) {
    const liquido = forma === FORMA_DINHEIRO ? round2(valor - troco) : round2(valor);
    if (liquido > 0) liquidoPorForma.push({ forma, valor: liquido });
  }

  // 1) Estoque + pagamentos + movimento de caixa — antes de emitir (o dinheiro já foi recebido).
  await prisma.$transaction(async (tx) => {
    await commitReservationsAsExit(tx, scope, "PEDIDO_VENDA", pedido.id, {
      documentoTipo: "PEDIDO_VENDA",
      documentoId: pedido.id
    });
    for (const p of pagamentos) {
      await tx.pagamentoVenda.create({
        data: {
          ...scopedByTenantCompany(scope),
          pedidoVendaId: pedido.id,
          forma: p.forma,
          valor: round2(Number(p.valor)),
          troco: p.forma === FORMA_DINHEIRO ? troco : 0
        }
      });
    }
    for (const m of liquidoPorForma) {
      await tx.caixaMovimento.create({
        data: {
          ...scopedByTenantCompany(scope),
          caixaId: caixa.id,
          tipo: "VENDA",
          formaPagamento: m.forma,
          valor: m.valor,
          pedidoVendaId: pedido.id,
          descricao: `Venda ${pedido.numero}`
        }
      });
    }
    await tx.pedidoVenda.update({
      where: { id: pedido.id },
      data: {
        status: "AGUARDANDO_NOTA",
        confirmadoEm: new Date(),
        formaPagamento: pagamentos.map((p) => p.forma).join(", ")
      }
    });
  });

  // 2) Documento fiscal a partir da pré-venda (consumidor anônimo quando não há cliente).
  const clienteLike = pedido.cliente
    ? {
        razaoSocial: pedido.cliente.razaoSocial,
        documento: pedido.cliente.documento,
        inscricaoEstadual: pedido.cliente.inscricaoEstadual,
        enderecos: pedido.cliente.enderecos.map((e) => ({
          uf: e.uf, padrao: e.padrao, logradouro: e.logradouro, numero: e.numero,
          complemento: e.complemento, bairro: e.bairro, cep: e.cep, cidade: e.cidade,
          codigoMunicipioIbge: e.codigoMunicipioIbge
        })),
        contatos: pedido.cliente.contatos.map((c) => ({ email: c.email, principal: c.principal }))
      }
    : { razaoSocial: "Consumidor final", documento: null, inscricaoEstadual: null, enderecos: [], contatos: [] };

  const doc = buildDocumentFromPedido({
    cliente: clienteLike,
    modelo: input.modelo,
    naturezaOperacao: "Venda de mercadoria",
    formaPagamento: pagamentos[0]?.forma ?? null,
    condicaoPagamento: pedido.condicaoPagamento,
    observacoes: pedido.observacoes,
    frete: Number(pedido.frete),
    desconto: Number(pedido.desconto),
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
          ? { ncm: item.produto.fiscal.ncm, cest: item.produto.fiscal.cest, origem: item.produto.fiscal.origem, regraTributariaId: item.produto.fiscal.regraTributariaId }
          : null
      },
      quantidade: Number(item.quantidade),
      precoUnitario: Number(item.precoUnitario),
      desconto: Number(item.desconto)
    }))
  });
  // Pagamentos do XML: líquidos por forma (somam o total da nota; troco fica fora).
  doc.pagamentos = liquidoPorForma;

  // 3) Emite. Rejeição/erro não desfaz o recebimento — a venda fica para reemitir.
  let nota: ReceberPagamentoResult["nota"] = null;
  let emitErro: string | null = null;
  try {
    const emitida = await emitFiscalDocument(scope, doc, { clienteId: pedido.clienteId, pedidoVendaId: pedido.id });
    nota = { id: emitida.id, status: emitida.status, numero: emitida.numero ?? null, chaveAcesso: emitida.chaveAcesso ?? null, motivo: emitida.motivo ?? null };
    if (emitida.status === "AUTORIZADA") {
      await prisma.pedidoVenda.update({ where: { id: pedido.id }, data: { status: "ENVIADO", faturadoEm: new Date() } });
    } else {
      emitErro = emitida.motivo ?? "Nota não autorizada.";
    }
  } catch (error) {
    emitErro = error instanceof Error ? error.message : "Falha ao emitir a nota.";
    const rejeitada = await prisma.notaFiscal.findFirst({
      where: { pedidoVendaId: pedido.id, ...scopedByTenantCompany(scope) },
      orderBy: { criadoEm: "desc" }
    });
    if (rejeitada) nota = { id: rejeitada.id, status: rejeitada.status, numero: rejeitada.numero ?? null, chaveAcesso: rejeitada.chaveAcesso ?? null, motivo: rejeitada.motivo ?? null };
  }

  return { pedidoId: pedido.id, pedidoNumero: pedido.numero, troco, nota, emitErro };
}
