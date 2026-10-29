import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { parseOfx, OfxParseError } from "@/lib/ofx/parse-ofx";
import { FinanceValidationError, settlePayable, settleReceivable } from "./finance-use-cases";

/**
 * EXTRATO POR ARQUIVO OFX — importação e conciliação.
 *
 * A conciliação por API só existe no Sicoob; bancos sem integração (e fatura de cartão) entram
 * por aqui. Duas regras de ouro:
 *   1. NADA é lançado automaticamente. A linha que não casa com um título fica PENDENTE,
 *      esperando o usuário vincular ou marcar como ignorada — criar lançamento sozinho duplicaria
 *      despesas que já entraram por outro caminho (entrada fiscal, gasto por cupom).
 *   2. Reimportar não duplica: o par (conta, FITID) é único. Períodos que se sobrepõem são
 *      normais no dia a dia e o sistema simplesmente conta quantas linhas já existiam.
 *
 * O casamento é SUGESTÃO, não decisão: valor exato e data próxima, com o título em aberto da
 * mesma empresa. Quem confirma é a pessoa.
 */

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Dias de tolerância entre a data do banco e o vencimento do título. */
const JANELA_DIAS = 5;

export type ResumoImportacao = {
  importacaoId: string;
  arquivo: string;
  conta: { id: string; nome: string };
  banco: string | null;
  contaDeclarada: string | null;
  periodo: { inicio: string | null; fim: string | null };
  saldoBanco: number | null;
  totalLinhas: number;
  novas: number;
  duplicadas: number;
  avisos: string[];
};

export async function importarOfx(
  scope: TenantScope,
  input: { contaBancariaId: string; arquivo: Buffer; arquivoNome: string },
  usuarioId?: string
): Promise<ResumoImportacao> {
  const conta = await prisma.contaBancaria.findFirst({
    where: { id: input.contaBancariaId, ...scopedByTenantCompany(scope) },
    select: { id: true, nome: true, tipo: true, conta: true }
  });
  if (!conta) throw new FinanceValidationError("Conta financeira não encontrada nesta empresa.");

  const extrato = parseOfx(input.arquivo);
  const avisos: string[] = [];

  // Conferência de identidade da conta: o OFX traz o número; se bater com outro cadastro, avisa.
  const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
  if (extrato.conta && digitos(conta.conta) && !digitos(extrato.conta).includes(digitos(conta.conta).slice(0, 6))) {
    avisos.push(
      `O arquivo é da conta ${extrato.conta} e você escolheu "${conta.nome}" (conta ${conta.conta || "sem número"}). Confira se é a conta certa.`
    );
  }
  if (extrato.tipoConta === "CARTAO" && conta.tipo !== "CARTAO") {
    avisos.push(`O arquivo é de FATURA DE CARTÃO e a conta "${conta.nome}" está cadastrada como ${conta.tipo.toLowerCase()}.`);
  }

  const importacao = await prisma.extratoOfxImportacao.create({
    data: {
      ...scopedByTenantCompany(scope),
      contaBancariaId: conta.id,
      arquivoNome: input.arquivoNome.slice(0, 200),
      banco: extrato.banco,
      contaDeclarada: extrato.conta,
      tipoConta: extrato.tipoConta,
      dataInicial: extrato.periodo.inicio,
      dataFinal: extrato.periodo.fim,
      saldoFinal: extrato.saldo.valor ?? null,
      saldoData: extrato.saldo.data,
      totalLinhas: extrato.transacoes.length,
      usuarioId: usuarioId ?? null
    }
  });

  let novas = 0;
  let duplicadas = 0;
  for (const t of extrato.transacoes) {
    const existente = await prisma.extratoOfxLinha.findFirst({
      where: { ...scopedByTenantCompany(scope), contaBancariaId: conta.id, fitid: t.fitid },
      select: { id: true }
    });
    if (existente) {
      duplicadas += 1;
      continue;
    }
    await prisma.extratoOfxLinha.create({
      data: {
        ...scopedByTenantCompany(scope),
        contaBancariaId: conta.id,
        importacaoId: importacao.id,
        fitid: t.fitid,
        data: t.data,
        valor: round2(t.valor),
        tipo: t.tipo,
        descricao: t.descricao,
        documento: t.documento
      }
    });
    novas += 1;
  }

  await prisma.extratoOfxImportacao.update({
    where: { id: importacao.id },
    data: { linhasNovas: novas, linhasDuplicadas: duplicadas }
  });

  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ExtratoOfxImportacao",
      entidadeId: importacao.id,
      acao: "EXTRATO_OFX_IMPORTADO",
      payload: { arquivo: input.arquivoNome, conta: conta.nome, total: extrato.transacoes.length, novas, duplicadas }
    })
  );

  if (duplicadas > 0) {
    avisos.push(`${duplicadas} lançamento(s) já tinham sido importados antes e foram ignorados (sem duplicar).`);
  }

  return {
    importacaoId: importacao.id,
    arquivo: input.arquivoNome,
    conta: { id: conta.id, nome: conta.nome },
    banco: extrato.banco,
    contaDeclarada: extrato.conta,
    periodo: { inicio: extrato.periodo.inicio?.toISOString() ?? null, fim: extrato.periodo.fim?.toISOString() ?? null },
    saldoBanco: extrato.saldo.valor ?? null,
    totalLinhas: extrato.transacoes.length,
    novas,
    duplicadas,
    avisos
  };
}

export type SugestaoTitulo = {
  id: string;
  tipo: "PAGAR" | "RECEBER";
  descricao: string;
  parte: string | null;
  documento: string | null;
  vencimento: string;
  saldo: number;
  /** Diferença de dias entre o extrato e o vencimento (ajuda a escolher entre dois candidatos). */
  diferencaDias: number;
};

export type LinhaExtratoPendente = {
  id: string;
  data: string;
  valor: number;
  tipo: string | null;
  descricao: string;
  documento: string | null;
  status: string;
  sugestoes: SugestaoTitulo[];
};

const diffDias = (a: Date, b: Date) => Math.round(Math.abs(a.getTime() - b.getTime()) / 86_400_000);

/**
 * Linhas ainda não resolvidas, com os títulos candidatos de cada uma (valor exato, vencimento
 * dentro da janela e título em aberto). Débito do banco casa com conta a PAGAR; crédito, com
 * conta a RECEBER.
 */
export async function linhasPendentes(
  scope: TenantScope,
  filtro: { contaBancariaId?: string; de?: Date; ate?: Date; incluirResolvidas?: boolean }
): Promise<LinhaExtratoPendente[]> {
  const linhas = await prisma.extratoOfxLinha.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      ...(filtro.contaBancariaId ? { contaBancariaId: filtro.contaBancariaId } : {}),
      ...(filtro.incluirResolvidas ? {} : { status: "PENDENTE" }),
      ...(filtro.de || filtro.ate ? { data: { ...(filtro.de ? { gte: filtro.de } : {}), ...(filtro.ate ? { lte: filtro.ate } : {}) } } : {})
    },
    orderBy: { data: "asc" },
    take: 500
  });

  const resultado: LinhaExtratoPendente[] = [];
  for (const linha of linhas) {
    const valor = Number(linha.valor);
    const alvo = round2(Math.abs(valor));
    const janelaDe = new Date(linha.data);
    janelaDe.setDate(janelaDe.getDate() - JANELA_DIAS);
    const janelaAte = new Date(linha.data);
    janelaAte.setDate(janelaAte.getDate() + JANELA_DIAS);

    const sugestoes: SugestaoTitulo[] = [];
    if (linha.status === "PENDENTE") {
      if (valor < 0) {
        const candidatos = await prisma.contaPagar.findMany({
          where: {
            ...scopedByTenantCompany(scope),
            status: { in: ["ABERTO", "VENCIDO", "PARCIAL"] },
            vencimento: { gte: janelaDe, lte: janelaAte }
          },
          select: { id: true, descricao: true, numeroDocumento: true, vencimento: true, valor: true, valorPago: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } },
          take: 60
        });
        for (const c of candidatos) {
          const saldo = round2(Number(c.valor) - Number(c.valorPago ?? 0));
          if (Math.abs(saldo - alvo) > 0.01) continue;
          sugestoes.push({
            id: c.id,
            tipo: "PAGAR",
            descricao: c.descricao,
            parte: c.fornecedor?.razaoSocial ?? c.fornecedor?.nomeFantasia ?? null,
            documento: c.numeroDocumento,
            vencimento: c.vencimento.toISOString(),
            saldo,
            diferencaDias: diffDias(c.vencimento, linha.data)
          });
        }
      } else {
        const candidatos = await prisma.contaReceber.findMany({
          where: {
            ...scopedByTenantCompany(scope),
            status: { in: ["ABERTO", "VENCIDO", "PARCIAL"] },
            vencimento: { gte: janelaDe, lte: janelaAte }
          },
          select: { id: true, descricao: true, numeroDocumento: true, vencimento: true, valor: true, valorPago: true, cliente: { select: { razaoSocial: true, nomeFantasia: true } } },
          take: 60
        });
        for (const c of candidatos) {
          const saldo = round2(Number(c.valor) - Number(c.valorPago ?? 0));
          if (Math.abs(saldo - alvo) > 0.01) continue;
          sugestoes.push({
            id: c.id,
            tipo: "RECEBER",
            descricao: c.descricao,
            parte: c.cliente?.razaoSocial ?? c.cliente?.nomeFantasia ?? null,
            documento: c.numeroDocumento,
            vencimento: c.vencimento.toISOString(),
            saldo,
            diferencaDias: diffDias(c.vencimento, linha.data)
          });
        }
      }
      sugestoes.sort((a, b) => a.diferencaDias - b.diferencaDias);
    }

    resultado.push({
      id: linha.id,
      data: linha.data.toISOString(),
      valor,
      tipo: linha.tipo,
      descricao: linha.descricao,
      documento: linha.documento,
      status: linha.status,
      sugestoes: sugestoes.slice(0, 5)
    });
  }
  return resultado;
}

/**
 * Vincula a linha do extrato a um título e dá a baixa com a DATA e o VALOR do banco — é o banco
 * que diz quando o dinheiro saiu/entrou.
 */
export async function conciliarLinha(
  scope: TenantScope,
  input: { linhaId: string; contaPagarId?: string | null; contaReceberId?: string | null },
  usuarioId?: string
) {
  const linha = await prisma.extratoOfxLinha.findFirst({ where: { id: input.linhaId, ...scopedByTenantCompany(scope) } });
  if (!linha) throw new FinanceValidationError("Linha do extrato não encontrada.");
  if (linha.status !== "PENDENTE") throw new FinanceValidationError("Esta linha já foi resolvida.");
  if (!input.contaPagarId && !input.contaReceberId) throw new FinanceValidationError("Escolha o título para vincular.");

  const valor = round2(Math.abs(Number(linha.valor)));
  const dataPagamento = linha.data;

  if (input.contaPagarId) {
    await settlePayable(scope, input.contaPagarId, { valor, contaBancariaId: linha.contaBancariaId, dataPagamento });
  } else if (input.contaReceberId) {
    await settleReceivable(scope, input.contaReceberId, { valor, contaBancariaId: linha.contaBancariaId, dataPagamento });
  }

  const atualizada = await prisma.extratoOfxLinha.update({
    where: { id: linha.id },
    data: {
      status: "CONCILIADA",
      contaPagarId: input.contaPagarId ?? null,
      contaReceberId: input.contaReceberId ?? null,
      conciliadoEm: new Date(),
      conciliadoPor: usuarioId ?? null
    }
  });

  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ExtratoOfxLinha",
      entidadeId: linha.id,
      acao: "EXTRATO_OFX_CONCILIADO",
      payload: { valor, data: dataPagamento.toISOString(), contaPagarId: input.contaPagarId ?? null, contaReceberId: input.contaReceberId ?? null }
    })
  );
  return atualizada;
}

/** Conciliação em lote: aplica os vínculos escolhidos; uma falha não derruba as outras. */
export async function conciliarLote(
  scope: TenantScope,
  vinculos: Array<{ linhaId: string; contaPagarId?: string | null; contaReceberId?: string | null }>,
  usuarioId?: string
): Promise<{ conciliadas: number; falhas: Array<{ linhaId: string; erro: string }> }> {
  const falhas: Array<{ linhaId: string; erro: string }> = [];
  let conciliadas = 0;
  for (const v of vinculos.slice(0, 300)) {
    try {
      await conciliarLinha(scope, v, usuarioId);
      conciliadas += 1;
    } catch (e) {
      falhas.push({ linhaId: v.linhaId, erro: e instanceof Error ? e.message : "Falha ao conciliar." });
    }
  }
  return { conciliadas, falhas };
}

/** Marca a linha como ignorada (transferência própria, estorno, aplicação) com o motivo. */
export async function ignorarLinha(scope: TenantScope, linhaId: string, motivo: string, usuarioId?: string) {
  const linha = await prisma.extratoOfxLinha.findFirst({ where: { id: linhaId, ...scopedByTenantCompany(scope) } });
  if (!linha) throw new FinanceValidationError("Linha do extrato não encontrada.");
  if (linha.status === "CONCILIADA") throw new FinanceValidationError("Linha já conciliada: desfaça o vínculo antes de ignorar.");

  const atualizada = await prisma.extratoOfxLinha.update({
    where: { id: linha.id },
    data: { status: "IGNORADA", motivoIgnorada: motivo.trim().slice(0, 300) || "Sem motivo informado", conciliadoPor: usuarioId ?? null, conciliadoEm: new Date() }
  });
  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, { scope, usuarioId, entidade: "ExtratoOfxLinha", entidadeId: linha.id, acao: "EXTRATO_OFX_IGNORADO", payload: { motivo } })
  );
  return atualizada;
}

/** Volta a linha para PENDENTE (não estorna a baixa — isso é feito no título, com trilha própria). */
export async function reabrirLinha(scope: TenantScope, linhaId: string, usuarioId?: string) {
  const linha = await prisma.extratoOfxLinha.findFirst({ where: { id: linhaId, ...scopedByTenantCompany(scope) } });
  if (!linha) throw new FinanceValidationError("Linha do extrato não encontrada.");
  const atualizada = await prisma.extratoOfxLinha.update({
    where: { id: linha.id },
    data: { status: "PENDENTE", contaPagarId: null, contaReceberId: null, motivoIgnorada: null, conciliadoEm: null, conciliadoPor: null }
  });
  await prisma.$transaction(async (tx) =>
    createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "ExtratoOfxLinha",
      entidadeId: linha.id,
      acao: "EXTRATO_OFX_REABERTO",
      payload: { statusAnterior: linha.status, contaPagarId: linha.contaPagarId, contaReceberId: linha.contaReceberId }
    })
  );
  return atualizada;
}

/** Resumo por conta: quanto ainda está pendente e qual o saldo declarado na última importação. */
export async function resumoExtratoOfx(scope: TenantScope, contaBancariaId?: string) {
  const where = { ...scopedByTenantCompany(scope), ...(contaBancariaId ? { contaBancariaId } : {}) };
  const [pendentes, conciliadas, ignoradas, ultima] = await Promise.all([
    prisma.extratoOfxLinha.aggregate({ where: { ...where, status: "PENDENTE" }, _count: true, _sum: { valor: true } }),
    prisma.extratoOfxLinha.count({ where: { ...where, status: "CONCILIADA" } }),
    prisma.extratoOfxLinha.count({ where: { ...where, status: "IGNORADA" } }),
    prisma.extratoOfxImportacao.findFirst({ where, orderBy: { criadoEm: "desc" }, include: { contaBancaria: { select: { nome: true } } } })
  ]);
  return {
    pendentes: pendentes._count,
    valorPendente: round2(Number(pendentes._sum.valor ?? 0)),
    conciliadas,
    ignoradas,
    ultimaImportacao: ultima
      ? {
          arquivo: ultima.arquivoNome,
          conta: ultima.contaBancaria.nome,
          em: ultima.criadoEm.toISOString(),
          periodo: { inicio: ultima.dataInicial?.toISOString() ?? null, fim: ultima.dataFinal?.toISOString() ?? null },
          saldoBanco: ultima.saldoFinal != null ? Number(ultima.saldoFinal) : null,
          novas: ultima.linhasNovas,
          duplicadas: ultima.linhasDuplicadas
        }
      : null
  };
}

export { OfxParseError };
