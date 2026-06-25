import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { nextDocumentNumber } from "@/lib/numbering";
import {
  exitStock,
  getDefaultDeposito,
  reserveStock,
  releaseReservations,
  commitReservationsAsExit
} from "@/domains/stock/application/stock-service";
import { buildNfseFromOrdemServico } from "@/domains/fiscal/document-builder";
import { emitFiscalDocument } from "@/domains/fiscal/application/fiscal-emission-use-cases";
import { isCodigoServicoValido } from "@/domains/fiscal/codigo-tributacao-nacional";
import { computeRetencoes, issPorServico } from "@/domains/fiscal/nfse-tax";
import type { RetencoesInput } from "@/domains/fiscal/nfse-tax";
import type { StatusOrdemServico } from "@prisma/client";
import type { TaxationTypeIss } from "@/domains/fiscal/types";
import { assertModuloLiberado } from "@/lib/auth/tenant-features";
import { gerarParcelas, rotuloParcela } from "@/lib/finance/condicao-pagamento";

const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

export type CreateOrdemServicoInput = {
  clienteId: string;
  equipamento: string;
  placaOuSerial?: string;
  problemaRelatado?: string;
  previsaoEm?: Date | string;
  depositoId?: string;
  observacoes?: string;
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
        problemaRelatado: input.problemaRelatado ?? null,
        previsaoEm: input.previsaoEm ? new Date(input.previsaoEm) : null,
        depositoId: input.depositoId ?? null,
        observacoes: input.observacoes ?? null,
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
  }, TX_OPTIONS);
}

export type AddServicoInput = {
  descricao: string;
  horas: number;
  valorHora: number;
  codigoServicoLc116?: string | null;
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

    const total = input.quantidade * Number(input.precoUnitario);
    const peca = await tx.ordemServicoPeca.create({
      data: {
        ...scopedByTenantCompany(scope),
        ordemServicoId: osId,
        produtoId: input.produtoId,
        quantidade: input.quantidade,
        precoUnitario: input.precoUnitario,
        total,
      },
    });

    // Reserva a peça no estoque (1 reserva por peça): dá visibilidade do comprometido e
    // impede duas OS de contarem com a mesma peça. A baixa física só ocorre no faturamento.
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
  }, TX_OPTIONS);
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
          produto: { select: { id: true, sku: true, nome: true, custoMedio: true, precoCusto: true } },
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
    for (const parcela of parcelas) {
      const cr = await tx.contaReceber.create({
        data: {
          ...scopedByTenantCompanyAmbiente(scope),
          clienteId: os.clienteId,
          ordemServicoId: id,
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

  // Emissão de NFS-e fora da transação (I/O externo)
  if (input.emitirNfse && os.servicos.length > 0) {
    try {
      // Código LC 116 por serviço; quando ausente, usa o padrão da empresa (config fiscal).
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

      const nota = await emitFiscalDocument(scope, docNfse, {
        clienteId: os.clienteId,
        ordemServicoId: id,
      });

      // Vincula nota fiscal à conta a receber
      if (nota.status === "AUTORIZADA") {
        await prisma.contaReceber.update({
          where: { id: contaReceber.id },
          data: { notaFiscalId: nota.id },
        });
      }

      return { id, status: "FATURADA", contaReceberId: contaReceber.id, notaFiscalId: nota.id, notaStatus: nota.status };
    } catch {
      // NFS-e falhou mas faturamento já foi confirmado
      return { id, status: "FATURADA", contaReceberId: contaReceber.id, nfseError: true };
    }
  }

  return { id, status: "FATURADA", contaReceberId: contaReceber.id };
}
