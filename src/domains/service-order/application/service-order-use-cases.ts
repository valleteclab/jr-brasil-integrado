import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { publishRealtime } from "@/lib/realtime/broker";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  exitStock,
  getDefaultDeposito,
  reserveStock,
  releaseReservations,
  commitReservationsAsExit
} from "@/domains/stock/application/stock-service";
import { buildDocumentFromPedido, buildNfseFromOrdemServico } from "@/domains/fiscal/document-builder";
import { emitFiscalDocument } from "@/domains/fiscal/application/fiscal-emission-use-cases";
import { isCodigoServicoValido } from "@/domains/fiscal/codigo-tributacao-nacional";
import { computeRetencoes, issPorServico } from "@/domains/fiscal/nfse-tax";
import type { RetencoesInput } from "@/domains/fiscal/nfse-tax";
import type { StatusOrdemServico } from "@prisma/client";
import type { TaxationTypeIss } from "@/domains/fiscal/types";
import { assertModuloLiberado } from "@/lib/auth/tenant-features";
import { gerarParcelas, rotuloParcela } from "@/lib/finance/condicao-pagamento";
import { classificacaoReceitaPadraoId } from "@/domains/finance/application/classificacao-use-cases";

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

export type CreateOrdemServicoInput = {
  clienteId: string;
  equipamento: string;
  placaOuSerial?: string;
  km?: string;
  problemaRelatado?: string;
  previsaoEm?: Date | string;
  depositoId?: string;
  observacoes?: string;
  tecnicoResponsavelId?: string | null;
};

export async function createOrdemServico(scope: TenantScope, input: CreateOrdemServicoInput) {
  await assertModuloLiberado(scope, "ordemServicoHabilitada");
  if (!input.clienteId) throw new Error("Cliente é obrigatório.");
  if (!input.equipamento) throw new Error("Equipamento é obrigatório.");

  return prisma.$transaction(async (tx) => {
    const numero = await nextDocumentNumber(tx, scope, "OS", tx.ordemServico);

    const os = await tx.ordemServico.create({
      data: {
        ...scopedByTenantCompanyAmbiente(scope),
        numero,
        clienteId: input.clienteId,
        equipamento: input.equipamento,
        placaOuSerial: input.placaOuSerial ?? null,
        km: input.km?.trim() || null,
        problemaRelatado: input.problemaRelatado ?? null,
        previsaoEm: input.previsaoEm ? new Date(input.previsaoEm) : null,
        depositoId: input.depositoId ?? null,
        observacoes: input.observacoes ?? null,
        tecnicoResponsavelId: input.tecnicoResponsavelId?.trim() || null,
        status: "ABERTA",
        totalServicos: 0,
        totalPecas: 0,
        desconto: 0,
        total: 0,
      },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "OrdemServico",
      entidadeId: os.id,
      acao: "CREATE",
      payload: { numero, clienteId: input.clienteId, equipamento: input.equipamento },
    });

    return os;
  }, TX_OPTIONS).then((os) => {
    publishRealtime(scope, "oficina"); // painel da oficina: nova OS na tela
    return os;
  });
}

export type AddServicoInput = {
  descricao: string;
  horas: number;
  valorHora: number;
  codigoServicoLc116?: string | null;
  tecnicoId?: string | null;
};

export async function addServico(scope: TenantScope, osId: string, input: AddServicoInput) {
  if (!input.descricao) throw new Error("Descrição do serviço é obrigatória.");
  if (input.horas <= 0) throw new Error("Horas deve ser maior que zero.");
  if (input.valorHora <= 0) throw new Error("Valor por hora deve ser maior que zero.");

  const codigoServicoLc116 = input.codigoServicoLc116?.trim() || null;
  if (codigoServicoLc116 && !isCodigoServicoValido(codigoServicoLc116)) {
    throw new Error("Código de serviço LC 116 inválido.");
  }

  return prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.findFirst({
      where: { id: osId, ...scopedByTenantCompany(scope) },
    });
    if (!os) throw new Error("Ordem de serviço não encontrada.");
    if (["FATURADA", "CANCELADA"].includes(os.status)) {
      throw new Error("Não é possível adicionar serviços a uma OS faturada ou cancelada.");
    }

    const total = Number(input.horas) * Number(input.valorHora);
    const maoObra = await tx.ordemServicoMaoObra.create({
      data: {
        ...scopedByTenantCompany(scope),
        ordemServicoId: osId,
        descricao: input.descricao,
        horas: input.horas,
        valorHora: input.valorHora,
        total,
        codigoServicoLc116,
        tecnicoId: input.tecnicoId?.trim() || null,
      },
    });

    // Recalcular totais
    const totalServicos = Number(os.totalServicos) + total;
    const totalPecas = Number(os.totalPecas);
    const novoTotal = Math.max(0, totalServicos + totalPecas - Number(os.desconto));

    await tx.ordemServico.update({
      where: { id: osId },
      data: { totalServicos, total: novoTotal },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "OrdemServicoMaoObra",
      entidadeId: maoObra.id,
      acao: "ADD",
      payload: { osId, descricao: input.descricao, total },
    });

    return maoObra;
  }, TX_OPTIONS);
}

export type AddPecaInput = {
  produtoId: string;
  quantidade: number;
  precoUnitario: number;
  /** Peça a COMPRAR (não há em estoque): registra como aguardando chegada, sem reservar. */
  aguardandoCompra?: boolean;
};

export async function addPeca(scope: TenantScope, osId: string, input: AddPecaInput) {
  if (!input.produtoId) throw new Error("Produto é obrigatório.");
  if (input.quantidade <= 0) throw new Error("Quantidade deve ser maior que zero.");
  if (input.precoUnitario <= 0) throw new Error("Preço unitário deve ser maior que zero.");

  return prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.findFirst({
      where: { id: osId, ...scopedByTenantCompany(scope) },
    });
    if (!os) throw new Error("Ordem de serviço não encontrada.");
    if (["FATURADA", "CANCELADA"].includes(os.status)) {
      throw new Error("Não é possível adicionar peças a uma OS faturada ou cancelada.");
    }

    const aguardandoCompra = input.aguardandoCompra === true;
    const total = input.quantidade * Number(input.precoUnitario);
    const peca = await tx.ordemServicoPeca.create({
      data: {
        ...scopedByTenantCompany(scope),
        ordemServicoId: osId,
        produtoId: input.produtoId,
        quantidade: input.quantidade,
        precoUnitario: input.precoUnitario,
        total,
        aguardandoCompra,
      },
    });

    // Peça EM ESTOQUE: reserva (1 reserva por peça) — visibilidade do comprometido e trava contra
    // duas OS contarem com a mesma peça; a baixa física só ocorre no faturamento. Peça A COMPRAR
    // não reserva (não há saldo) — fica aguardando a nota de entrada chegar.
    if (!aguardandoCompra) {
      const deposito = os.depositoId
        ? { id: os.depositoId }
        : await getDefaultDeposito(tx, scope);
      await reserveStock(tx, scope, {
        produtoId: input.produtoId,
        depositoId: deposito.id,
        quantidade: input.quantidade,
        origemTipo: "ORDEM_SERVICO_PECA",
        origemId: peca.id,
      });
    }

    // Recalcular totais
    const totalServicos = Number(os.totalServicos);
    const totalPecas = Number(os.totalPecas) + total;
    const novoTotal = Math.max(0, totalServicos + totalPecas - Number(os.desconto));

    await tx.ordemServico.update({
      where: { id: osId },
      data: { totalPecas, total: novoTotal },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "OrdemServicoPeca",
      entidadeId: peca.id,
      acao: "ADD",
      payload: { osId, produtoId: input.produtoId, quantidade: input.quantidade, total },
    });

    return peca;
  }, TX_OPTIONS);
}

export async function removeServico(scope: TenantScope, osId: string, servicoId: string) {
  return prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.findFirst({
      where: { id: osId, ...scopedByTenantCompany(scope) },
    });
    if (!os) throw new Error("Ordem de serviço não encontrada.");
    if (["FATURADA", "CANCELADA"].includes(os.status)) {
      throw new Error("Não é possível remover serviços de uma OS faturada ou cancelada.");
    }

    const servico = await tx.ordemServicoMaoObra.findFirst({
      where: { id: servicoId, ordemServicoId: osId, ...scopedByTenantCompany(scope) },
    });
    if (!servico) throw new Error("Serviço não encontrado.");

    await tx.ordemServicoMaoObra.delete({ where: { id: servicoId } });

    const totalServicos = Math.max(0, Number(os.totalServicos) - Number(servico.total));
    const totalPecas = Number(os.totalPecas);
    const novoTotal = Math.max(0, totalServicos + totalPecas - Number(os.desconto));

    await tx.ordemServico.update({
      where: { id: osId },
      data: { totalServicos, total: novoTotal },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "OrdemServicoMaoObra",
      entidadeId: servicoId,
      acao: "REMOVE",
      payload: { osId },
    });

    return { removed: true };
  }, TX_OPTIONS);
}

export async function removePeca(scope: TenantScope, osId: string, pecaId: string) {
  return prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.findFirst({
      where: { id: osId, ...scopedByTenantCompany(scope) },
    });
    if (!os) throw new Error("Ordem de serviço não encontrada.");
    if (["FATURADA", "CANCELADA"].includes(os.status)) {
      throw new Error("Não é possível remover peças de uma OS faturada ou cancelada.");
    }

    const peca = await tx.ordemServicoPeca.findFirst({
      where: { id: pecaId, ordemServicoId: osId, ...scopedByTenantCompany(scope) },
    });
    if (!peca) throw new Error("Peça não encontrada.");

    // Libera a reserva de estoque da peça antes de removê-la.
    await releaseReservations(tx, scope, "ORDEM_SERVICO_PECA", pecaId);

    await tx.ordemServicoPeca.delete({ where: { id: pecaId } });

    const totalServicos = Number(os.totalServicos);
    const totalPecas = Math.max(0, Number(os.totalPecas) - Number(peca.total));
    const novoTotal = Math.max(0, totalServicos + totalPecas - Number(os.desconto));

    await tx.ordemServico.update({
      where: { id: osId },
      data: { totalPecas, total: novoTotal },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "OrdemServicoPeca",
      entidadeId: pecaId,
      acao: "REMOVE",
      payload: { osId },
    });

    return { removed: true };
  }, TX_OPTIONS);
}

export type UpdateOrdemServicoInput = {
  equipamento?: string;
  placaOuSerial?: string | null;
  km?: string | null;
  problemaRelatado?: string | null;
  diagnostico?: string | null;
  previsaoEm?: string | null;
  observacoes?: string | null;
  tecnicoResponsavelId?: string | null;
  /** Desconto em VALOR (R$) sobre o total. Recalcula o total da OS. */
  desconto?: number | null;
};

/** Edita o cabeçalho da OS (dados do veículo/diagnóstico, técnico responsável, desconto). */
export async function updateOrdemServico(scope: TenantScope, osId: string, input: UpdateOrdemServicoInput) {
  return prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.findFirst({ where: { id: osId, ...scopedByTenantCompany(scope) } });
    if (!os) throw new Error("Ordem de serviço não encontrada.");
    if (["FATURADA", "CANCELADA"].includes(os.status)) {
      throw new Error("Não é possível editar uma OS faturada ou cancelada.");
    }

    // Técnico responsável precisa existir na empresa.
    if (input.tecnicoResponsavelId) {
      const t = await tx.tecnico.findFirst({ where: { id: input.tecnicoResponsavelId, ...scopedByTenantCompany(scope) }, select: { id: true } });
      if (!t) throw new Error("Técnico responsável não encontrado.");
    }

    const data: Record<string, unknown> = {};
    if (input.equipamento !== undefined) {
      const eq = input.equipamento.trim();
      if (!eq) throw new Error("O equipamento não pode ficar vazio.");
      data.equipamento = eq;
    }
    if (input.placaOuSerial !== undefined) data.placaOuSerial = input.placaOuSerial?.trim() || null;
    if (input.km !== undefined) data.km = input.km?.trim() || null;
    if (input.problemaRelatado !== undefined) data.problemaRelatado = input.problemaRelatado?.trim() || null;
    if (input.diagnostico !== undefined) data.diagnostico = input.diagnostico?.trim() || null;
    if (input.observacoes !== undefined) data.observacoes = input.observacoes?.trim() || null;
    if (input.previsaoEm !== undefined) {
      data.previsaoEm = input.previsaoEm ? new Date(`${input.previsaoEm.slice(0, 16)}`) : null;
    }
    if (input.tecnicoResponsavelId !== undefined) data.tecnicoResponsavelId = input.tecnicoResponsavelId?.trim() || null;
    if (input.desconto !== undefined) {
      const desconto = Math.max(0, Number(input.desconto ?? 0) || 0);
      const bruto = Number(os.totalServicos) + Number(os.totalPecas);
      if (desconto > bruto) throw new Error(`O desconto (${desconto.toFixed(2)}) não pode ser maior que o total dos itens (${bruto.toFixed(2)}).`);
      data.desconto = desconto;
      data.total = Math.max(0, bruto - desconto);
    }

    const atualizada = await tx.ordemServico.update({ where: { id: osId }, data });
    await createAuditLog(tx, {
      scope, entidade: "OrdemServico", entidadeId: osId, acao: "UPDATE",
      payload: { campos: Object.keys(data) }
    });
    return atualizada;
  }, TX_OPTIONS).then((os) => {
    publishRealtime(scope, "oficina"); // painel: previsão/técnico/desconto podem ter mudado
    return os;
  });
}

export type AddApontamentoInput = {
  tecnicoId: string;
  descricao: string;
  horas?: number | null;
};

/**
 * APONTAMENTO: o técnico registra o QUE FOI FEITO na OS (timeline de execução) + horas gastas.
 * É o histórico de trabalho — distinto da mão de obra COBRADA (que vai na nota fiscal).
 */
export async function addApontamento(scope: TenantScope, osId: string, input: AddApontamentoInput) {
  const descricao = input.descricao?.trim();
  if (!descricao) throw new Error("Descreva o que foi feito.");
  if (!input.tecnicoId) throw new Error("Técnico não identificado.");

  return prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.findFirst({ where: { id: osId, ...scopedByTenantCompany(scope) }, select: { id: true, status: true } });
    if (!os) throw new Error("Ordem de serviço não encontrada.");
    if (["FATURADA", "CANCELADA"].includes(os.status)) {
      throw new Error("Não é possível apontar em uma OS faturada ou cancelada.");
    }
    const tecnico = await tx.tecnico.findFirst({ where: { id: input.tecnicoId, ...scopedByTenantCompany(scope) }, select: { id: true, nome: true } });
    if (!tecnico) throw new Error("Técnico não encontrado.");

    const apontamento = await tx.ordemServicoApontamento.create({
      data: {
        ...scopedByTenantCompany(scope),
        ordemServicoId: osId,
        tecnicoId: tecnico.id,
        descricao,
        horas: input.horas != null && Number(input.horas) > 0 ? Number(input.horas) : null,
        statusMomento: os.status
      }
    });
    await createAuditLog(tx, {
      scope, entidade: "OrdemServicoApontamento", entidadeId: apontamento.id, acao: "ADD",
      payload: { osId, tecnico: tecnico.nome, horas: input.horas ?? null }
    });
    return apontamento;
  }, TX_OPTIONS).then((a) => {
    publishRealtime(scope, "oficina");
    return a;
  });
}

const VALID_STATUS_TRANSITIONS: Record<string, StatusOrdemServico[]> = {
  ABERTA: ["EM_ANDAMENTO", "CANCELADA"],
  EM_ANDAMENTO: ["AGUARDANDO_PECAS", "FINALIZADA_NAO_FATURADA", "ABERTA"],
  AGUARDANDO_PECAS: ["EM_ANDAMENTO", "FINALIZADA_NAO_FATURADA"],
  FINALIZADA_NAO_FATURADA: ["EM_ANDAMENTO"],
  FATURADA: [],
  CANCELADA: [],
};

export async function updateStatus(scope: TenantScope, osId: string, status: StatusOrdemServico) {
  return prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.findFirst({
      where: { id: osId, ...scopedByTenantCompany(scope) },
    });
    if (!os) throw new Error("Ordem de serviço não encontrada.");

    const allowed = VALID_STATUS_TRANSITIONS[os.status] ?? [];
    if (!allowed.includes(status)) {
      throw new Error(`Não é possível mudar status de ${os.status} para ${status}.`);
    }

    // OS cancelada devolve as peças reservadas ao saldo disponível.
    if (status === "CANCELADA") {
      const pecas = await tx.ordemServicoPeca.findMany({
        where: { ordemServicoId: osId, ...scopedByTenantCompany(scope) },
        select: { id: true },
      });
      for (const peca of pecas) {
        await releaseReservations(tx, scope, "ORDEM_SERVICO_PECA", peca.id);
      }
    }

    const updated = await tx.ordemServico.update({
      where: { id: osId },
      data: { status },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "OrdemServico",
      entidadeId: osId,
      acao: "STATUS_CHANGE",
      payload: { de: os.status, para: status },
    });

    return updated;
  }, TX_OPTIONS).then((updated) => {
    publishRealtime(scope, "oficina"); // painel da oficina: OS mudou de coluna
    return updated;
  });
}

export type FaturarOsInput = {
  emitirNfse?: boolean;
  condicaoPagamento?: string;
  formaPagamento?: string;
  /** NFS-e: natureza/exigibilidade do ISS (padrão: tributado no município). */
  taxationType?: TaxationTypeIss | null;
  /** NFS-e: alíquota de ISS informada (%) — sobrepõe a regra tributária. */
  aliquotaIss?: number | null;
  /** NFS-e: deduções da base de cálculo do ISS (R$). */
  deducoes?: number | null;
  /** NFS-e: base de cálculo do ISS informada (R$). */
  baseCalculoIss?: number | null;
  /** NFS-e: retenções na fonte (ISS retido + federais). */
  retencoes?: RetencoesInput | null;
  /** Emitir NF-e modelo 55 das PEÇAS (mercadoria) — nota própria além da NFS-e dos serviços. */
  emitirNfePecas?: boolean;
};

export async function faturarOrdemServico(scope: TenantScope, id: string, input: FaturarOsInput = {}) {
  // Carrega OS completa com cliente, serviços e peças
  const os = await prisma.ordemServico.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: {
      cliente: {
        include: {
          enderecos: true,
          contatos: true,
        },
      },
      servicos: true,
      pecas: {
        include: {
          produto: {
            select: {
              id: true, sku: true, nome: true, custoMedio: true, precoCusto: true,
              ncm: true, cest: true, cfop: true, origem: true, unidade: true,
              fiscal: { select: { ncm: true, cest: true, origem: true, regraTributariaId: true, icmsSt: true } }
            }
          },
        },
      },
    },
  });

  if (!os) throw new Error("Ordem de serviço não encontrada.");
  if (os.status === "FATURADA") throw new Error("OS já foi faturada.");
  if (os.status === "CANCELADA") throw new Error("OS cancelada não pode ser faturada.");
  if (!["FINALIZADA_NAO_FATURADA", "EM_ANDAMENTO", "AGUARDANDO_PECAS"].includes(os.status)) {
    throw new Error("A OS deve estar em FINALIZADA_NAO_FATURADA, EM_ANDAMENTO ou AGUARDANDO_PECAS para ser faturada.");
  }

  const condicaoPagamento = input.condicaoPagamento ?? os.condicaoPagamento ?? null;
  const formaPagamento = input.formaPagamento ?? os.formaPagamento ?? null;

  // Transação: baixa de estoque + contas a receber
  const { contaReceber } = await prisma.$transaction(async (tx) => {
    // Trava otimista contra duplo-clique/concorrência: marca FATURADA somente se ainda NÃO estava.
    // O guard de status fora da transação é apenas UX; esta é a checagem autoritativa. Se outra
    // requisição já faturou, count = 0 e abortamos antes de criar conta a receber/baixar estoque.
    const travada = await tx.ordemServico.updateMany({
      where: { id, ...scopedByTenantCompany(scope), status: { not: "FATURADA" } },
      data: { status: "FATURADA", faturadoEm: new Date() }
    });
    if (travada.count === 0) {
      throw new Error("OS já foi faturada.");
    }

    const deposito = os.depositoId
      ? await tx.deposito.findFirst({ where: { id: os.depositoId } }) ?? await getDefaultDeposito(tx, scope)
      : await getDefaultDeposito(tx, scope);

    // Baixa de estoque das peças: efetiva as reservas feitas no addPeca. Peças adicionadas
    // antes do controle de reserva existir (sem reserva ativa) baixam direto, como antes.
    const semReserva: Array<{ produtoId: string; depositoId: string; quantidade: number; custoUnitario: number }> = [];
    for (const p of os.pecas) {
      const reservasBaixadas = await commitReservationsAsExit(tx, scope, "ORDEM_SERVICO_PECA", p.id, {
        documentoTipo: "ORDEM_SERVICO",
        documentoId: id,
      });
      if (reservasBaixadas === 0) {
        semReserva.push({
          produtoId: p.produtoId,
          depositoId: deposito.id,
          quantidade: Number(p.quantidade),
          custoUnitario: Number(p.produto.custoMedio ?? p.produto.precoCusto ?? 0),
        });
      }
    }
    if (semReserva.length > 0) {
      await exitStock(tx, scope, semReserva, { documentoTipo: "ORDEM_SERVICO", documentoId: id });
    }

    // Vencimentos derivados da condição de pagamento (reaproveita o helper das vendas):
    // "30/60/90" gera 3 parcelas, "à vista" vence hoje; sem condição, 1 parcela em 30 dias.
    const parcelas = gerarParcelas(Number(os.total), condicaoPagamento);
    const contasReceber = [] as Array<{ id: string }>;
    const classificacaoReceita = await classificacaoReceitaPadraoId(tx, scope, "servicos");
    for (const parcela of parcelas) {
      const cr = await tx.contaReceber.create({
        data: {
          ...scopedByTenantCompanyAmbiente(scope),
          clienteId: os.clienteId,
          ordemServicoId: id,
          classificacaoId: classificacaoReceita,
          descricao: `OS ${os.numero} — ${os.equipamento}${rotuloParcela(parcela)}`,
          numeroDocumento: os.numero,
          origem: "OS",
          formaPagamento: formaPagamento ?? null,
          vencimento: parcela.vencimento,
          valor: parcela.valor,
          valorPago: 0,
          juros: 0,
          multa: 0,
          descontoBaixa: 0,
          status: "ABERTO",
        },
      });
      contasReceber.push({ id: cr.id });
    }
    // Primeira parcela é a referência para vincular eventual NFS-e (uma nota por faturamento).
    const cr = contasReceber[0];

    // Status/faturadoEm já gravados na trava otimista; aqui só persistimos condição/forma.
    await tx.ordemServico.update({
      where: { id },
      data: {
        condicaoPagamento: condicaoPagamento ?? undefined,
        formaPagamento: formaPagamento ?? undefined,
      },
    });

    await createAuditLog(tx, {
      scope,
      entidade: "OrdemServico",
      entidadeId: id,
      acao: "FATURAR",
      payload: { total: Number(os.total), contaReceberID: cr.id },
    });

    return { contaReceber: cr };
  }, TX_OPTIONS);

  publishRealtime(scope, "oficina"); // painel da oficina: OS faturada sai do quadro

  // Emissões fiscais FORA da transação (I/O externo). O faturamento JÁ foi confirmado — falha
  // fiscal não desfaz a baixa/conta a receber; devolve o erro para reemitir depois.
  const resultado: {
    id: string; status: string; contaReceberId: string;
    notaFiscalId?: string; notaStatus?: string; nfseError?: boolean;
    notaPecasId?: string; notaPecasStatus?: string; nfePecasError?: boolean;
  } = { id, status: "FATURADA", contaReceberId: contaReceber.id };

  // 1) NFS-e dos SERVIÇOS (mão de obra).
  if (input.emitirNfse && os.servicos.length > 0) {
    try {
      const configFiscal = await prisma.configuracaoFiscal.findUnique({
        where: { empresaId: scope.empresaId },
        select: { codigoServicoLc116Padrao: true },
      });
      const lc116Padrao = configFiscal?.codigoServicoLc116Padrao ?? null;
      const valorServicos = os.servicos.reduce((sum, s) => sum + Number(s.total), 0);
      const issInput = {
        aliquotaIss: input.aliquotaIss ?? null,
        deducoes: input.deducoes ?? null,
        baseCalculoIss: input.baseCalculoIss ?? null,
      };
      const docNfse = buildNfseFromOrdemServico({
        cliente: os.cliente,
        condicaoPagamento: condicaoPagamento ?? null,
        formaPagamento: formaPagamento ?? null,
        taxationType: input.taxationType ?? null,
        retencoes: computeRetencoes(valorServicos, input.retencoes),
        servicos: os.servicos.map((s) => {
          const iss = issPorServico(valorServicos, Number(s.total), issInput);
          return {
            descricao: s.descricao,
            valor: Number(s.total),
            itemListaServico: s.codigoServicoLc116 ?? lc116Padrao,
            aliquotaIss: iss.aliquotaIss,
            baseIss: iss.baseIss,
          };
        }),
      });
      const nota = await emitFiscalDocument(scope, docNfse, { clienteId: os.clienteId, ordemServicoId: id });
      if (nota.status === "AUTORIZADA") {
        await prisma.contaReceber.update({ where: { id: contaReceber.id }, data: { notaFiscalId: nota.id } });
      }
      resultado.notaFiscalId = nota.id;
      resultado.notaStatus = nota.status;
    } catch {
      resultado.nfseError = true;
    }
  }

  // 2) NF-e modelo 55 das PEÇAS (mercadoria). Documento fiscal PRÓPRIO — obrigatório para a saída
  //    de mercadoria (ICMS). Usa a mesma ficha fiscal/regra tributária do produto (como na venda).
  if (input.emitirNfePecas && os.pecas.length > 0) {
    try {
      const docPecas = buildDocumentFromPedido({
        cliente: os.cliente,
        modelo: "NFE",
        naturezaOperacao: "Venda de peças (ordem de serviço)",
        formaPagamento: formaPagamento ?? null,
        condicaoPagamento: condicaoPagamento ?? null,
        numeroPedido: os.numero,
        observacoes: `Peças da OS ${os.numero} — ${os.equipamento}.`,
        itens: os.pecas.map((p) => ({
          produto: {
            id: p.produto.id,
            sku: p.produto.sku,
            nome: p.produto.nome,
            ncm: p.produto.ncm,
            cest: p.produto.cest,
            cfop: p.produto.cfop,
            origem: p.produto.origem,
            unidade: p.produto.unidade,
            fiscal: p.produto.fiscal
              ? {
                  ncm: p.produto.fiscal.ncm,
                  cest: p.produto.fiscal.cest,
                  origem: p.produto.fiscal.origem,
                  regraTributariaId: p.produto.fiscal.regraTributariaId,
                  icmsSt: p.produto.fiscal.icmsSt,
                }
              : null,
          },
          quantidade: Number(p.quantidade),
          precoUnitario: Number(p.precoUnitario),
        })),
      });
      const notaPecas = await emitFiscalDocument(scope, docPecas, { clienteId: os.clienteId, ordemServicoId: id });
      resultado.notaPecasId = notaPecas.id;
      resultado.notaPecasStatus = notaPecas.status;
    } catch {
      resultado.nfePecasError = true;
    }
  }

  return resultado;
}

/**
 * REEMITE uma nota da OS já FATURADA: NFS-e (serviços) ou NF-e modelo 55 (peças). Reaproveita uma
 * nota anterior REJEITADA/ERRO (retryNotaId) quando houver — senão emite nova. Usa as regras
 * tributárias padrão (ISS/retenções manuais informados no faturamento não são regravados; para
 * casos especiais, emita pelo módulo Fiscal). Só para OS FATURADA.
 */
export async function reemitirNotaOrdemServico(scope: TenantScope, osId: string, tipo: "SERVICOS" | "PECAS") {
  const os = await prisma.ordemServico.findFirst({
    where: { id: osId, ...scopedByTenantCompany(scope) },
    include: {
      cliente: { include: { enderecos: true, contatos: true } },
      servicos: true,
      pecas: {
        include: {
          produto: {
            select: {
              id: true, sku: true, nome: true, ncm: true, cest: true, cfop: true, origem: true, unidade: true,
              fiscal: { select: { ncm: true, cest: true, origem: true, regraTributariaId: true, icmsSt: true } }
            }
          }
        }
      },
      notasFiscais: { select: { id: true, modelo: true, status: true } }
    }
  });
  if (!os) throw new Error("Ordem de serviço não encontrada.");
  if (os.status !== "FATURADA") throw new Error("A OS precisa estar faturada para reemitir a nota.");

  const modeloAlvo = tipo === "SERVICOS" ? "NFSE" : "NFE";
  if (tipo === "SERVICOS" && os.servicos.length === 0) throw new Error("A OS não tem serviços para emitir NFS-e.");
  if (tipo === "PECAS" && os.pecas.length === 0) throw new Error("A OS não tem peças para emitir NF-e.");

  // Já existe uma nota AUTORIZADA desse tipo? Não reemite (evita duplicidade).
  const jaAutorizada = os.notasFiscais.find((n) => n.modelo === modeloAlvo && n.status === "AUTORIZADA");
  if (jaAutorizada) throw new Error(`Já existe ${modeloAlvo === "NFSE" ? "uma NFS-e" : "uma NF-e"} autorizada para esta OS.`);
  // Nota anterior falhada para reaproveitar (retry).
  const falhada = os.notasFiscais.find((n) => n.modelo === modeloAlvo && (n.status === "REJEITADA" || n.status === "ERRO"));

  let doc;
  if (tipo === "SERVICOS") {
    const configFiscal = await prisma.configuracaoFiscal.findUnique({
      where: { empresaId: scope.empresaId }, select: { codigoServicoLc116Padrao: true }
    });
    const lc116Padrao = configFiscal?.codigoServicoLc116Padrao ?? null;
    const valorServicos = os.servicos.reduce((s, sv) => s + Number(sv.total), 0);
    doc = buildNfseFromOrdemServico({
      cliente: os.cliente,
      condicaoPagamento: os.condicaoPagamento,
      formaPagamento: os.formaPagamento,
      servicos: os.servicos.map((s) => {
        const iss = issPorServico(valorServicos, Number(s.total), { aliquotaIss: null, deducoes: null, baseCalculoIss: null });
        return { descricao: s.descricao, valor: Number(s.total), itemListaServico: s.codigoServicoLc116 ?? lc116Padrao, aliquotaIss: iss.aliquotaIss, baseIss: iss.baseIss };
      })
    });
  } else {
    doc = buildDocumentFromPedido({
      cliente: os.cliente,
      modelo: "NFE",
      naturezaOperacao: "Venda de peças (ordem de serviço)",
      formaPagamento: os.formaPagamento,
      condicaoPagamento: os.condicaoPagamento,
      numeroPedido: os.numero,
      observacoes: `Peças da OS ${os.numero} — ${os.equipamento}.`,
      itens: os.pecas.map((p) => ({
        produto: {
          id: p.produto.id, sku: p.produto.sku, nome: p.produto.nome, ncm: p.produto.ncm, cest: p.produto.cest,
          cfop: p.produto.cfop, origem: p.produto.origem, unidade: p.produto.unidade,
          fiscal: p.produto.fiscal ? {
            ncm: p.produto.fiscal.ncm, cest: p.produto.fiscal.cest, origem: p.produto.fiscal.origem,
            regraTributariaId: p.produto.fiscal.regraTributariaId, icmsSt: p.produto.fiscal.icmsSt
          } : null
        },
        quantidade: Number(p.quantidade),
        precoUnitario: Number(p.precoUnitario)
      }))
    });
  }

  const nota = await emitFiscalDocument(scope, doc, { clienteId: os.clienteId, ordemServicoId: osId, retryNotaId: falhada?.id ?? null });
  return { notaId: nota.id, status: nota.status, modelo: modeloAlvo };
}

/**
 * PEÇAS A COMPRAR: peças de OS abertas marcadas como "aguardando compra" e ainda não chegadas.
 * É a fila de compras da oficina — o comprador vê o que precisa pedir e para qual OS.
 */
export async function listPecasAguardandoCompra(scope: TenantScope) {
  const pecas = await prisma.ordemServicoPeca.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      aguardandoCompra: true,
      chegouEm: null,
      ordemServico: { status: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECAS"] } }
    },
    include: {
      produto: { select: { sku: true, nome: true } },
      ordemServico: { select: { id: true, numero: true, equipamento: true, cliente: { select: { razaoSocial: true, nomeFantasia: true } } } }
    },
    orderBy: { ordemServico: { criadoEm: "asc" } }
  });
  return pecas.map((p) => ({
    id: p.id,
    osId: p.ordemServico.id,
    osNumero: p.ordemServico.numero,
    equipamento: p.ordemServico.equipamento,
    cliente: p.ordemServico.cliente.nomeFantasia || p.ordemServico.cliente.razaoSocial,
    produtoId: p.produtoId,
    sku: p.produto.sku,
    nome: p.produto.nome,
    quantidade: Number(p.quantidade)
  }));
}

/**
 * NOTIFICA a chegada de peças: chamado quando uma ENTRADA FISCAL credita estoque dos produtos.
 * Marca `chegouEm` nas peças de OS que aguardavam esses produtos e devolve as OS afetadas (para
 * o chamador publicar o realtime da oficina fora da transação). Idempotente (só as ainda não
 * chegadas). Recebe o `tx` da própria transação da entrada fiscal.
 */
export async function notificarChegadaPecas(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  produtoIds: string[]
): Promise<string[]> {
  const ids = Array.from(new Set(produtoIds.filter(Boolean)));
  if (!ids.length) return [];
  const pendentes = await tx.ordemServicoPeca.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      produtoId: { in: ids },
      aguardandoCompra: true,
      chegouEm: null,
      ordemServico: { status: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECAS"] } }
    },
    select: { id: true, ordemServicoId: true }
  });
  if (!pendentes.length) return [];
  await tx.ordemServicoPeca.updateMany({
    where: { id: { in: pendentes.map((p) => p.id) } },
    data: { chegouEm: new Date() }
  });
  return Array.from(new Set(pendentes.map((p) => p.ordemServicoId)));
}
