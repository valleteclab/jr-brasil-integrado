import type { Prisma } from "@prisma/client";
import type { FinalidadeEntrada } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { finalidadeMovimentaEstoque } from "@/domains/fiscal/finalidade-entrada";
import { custoMedioApos } from "./custo-medio";
import { applyFinalidadeManual } from "./fiscal-entry-use-cases";

/**
 * RECLASSIFICAR A FINALIDADE DE UM ITEM JÁ PROCESSADO.
 *
 * Antes, corrigir uma finalidade marcada errada exigia estornar a entrada, excluí-la, voltar na
 * distribuição, dar ciência de novo e reimportar o XML. Um caminho longo para o que normalmente
 * é um clique errado na conferência.
 *
 * O que a finalidade decide — e que portanto precisa ser refeito aqui:
 *  1. se o item entra no ESTOQUE (revenda/insumo entram; uso-consumo e imobilizado não);
 *  2. o CFOP de entrada, que vai para o SPED;
 *  3. o CRÉDITO de cada tributo na apuração;
 *  4. o bem do ATIVO (CIAP), criado quando a finalidade é IMOBILIZADO.
 *
 * O ajuste de estoque é lançado como movimento próprio (RECLASSIFICACAO), não como estorno:
 * o histórico precisa mostrar o que aconteceu de verdade.
 */

export class ReclassificacaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReclassificacaoError";
  }
}

export type ImpactoReclassificacao = {
  finalidadeAtual: FinalidadeEntrada | null;
  finalidadeNova: FinalidadeEntrada;
  /** Entra ou sai do estoque por causa da troca. */
  efeitoEstoque: "NENHUM" | "REMOVER" | "INCLUIR";
  quantidade: number;
  /** O período já tem SPED gerado: mexer em CFOP/crédito pede retificação. */
  exigeRetificacaoSped: boolean;
  competenciaSped: string | null;
};

const DEPOSITO_PADRAO = "Galpão LEM-1 · Estoque geral";

/**
 * Diz o que vai acontecer ANTES de acontecer, para a tela avisar o usuário.
 * Não altera nada.
 */
export async function simularReclassificacao(
  scope: TenantScope,
  itemId: string,
  novaFinalidade: FinalidadeEntrada
): Promise<ImpactoReclassificacao> {
  const item = await prisma.entradaFiscalItem.findFirst({
    where: { id: itemId, ...scopedByTenantCompany(scope) },
    select: {
      finalidade: true,
      movimentaEstoque: true,
      quantidade: true,
      fatorConversao: true,
      entradaFiscal: { select: { emitidaEm: true, recebidaEm: true } }
    }
  });
  if (!item) throw new ReclassificacaoError("Item da entrada fiscal não encontrado.");

  const movimentaDepois = finalidadeMovimentaEstoque(novaFinalidade);
  const fator = Number(item.fatorConversao) > 0 ? Number(item.fatorConversao) : 1;
  const quantidade = Number(item.quantidade) * fator;

  const efeitoEstoque =
    item.movimentaEstoque === movimentaDepois ? "NENHUM" : item.movimentaEstoque ? "REMOVER" : "INCLUIR";

  // SPED já gerado no mês da nota? Então CFOP/crédito mudaram depois da declaração.
  const referencia = item.entradaFiscal.recebidaEm ?? item.entradaFiscal.emitidaEm ?? null;
  let exigeRetificacaoSped = false;
  let competenciaSped: string | null = null;
  if (referencia) {
    const ano = referencia.getFullYear();
    const mes = referencia.getMonth() + 1;
    const sped = await prisma.spedArquivo.findFirst({
      where: { ...scopedByTenantCompany(scope), ano, mes },
      select: { id: true }
    });
    if (sped) {
      exigeRetificacaoSped = true;
      competenciaSped = `${String(mes).padStart(2, "0")}/${ano}`;
    }
  }

  return {
    finalidadeAtual: item.finalidade,
    finalidadeNova: novaFinalidade,
    efeitoEstoque,
    quantidade,
    exigeRetificacaoSped,
    competenciaSped
  };
}

/** Ajuste de estoque da reclassificação: tira ou devolve a quantidade da nota, refazendo o custo médio. */
async function ajustarEstoque(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  args: {
    produtoId: string;
    depositoId: string;
    quantidade: number;
    custoUnitario: number;
    custoTotal: number;
    remover: boolean;
    entradaId: string;
    itemId: string;
    sku: string;
    permiteNegativo: boolean;
    custoMedioAtual: number;
    descricao: string;
  }
) {
  const chave = {
    tenantId_empresaId_produtoId_depositoId_controleKey: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId: args.produtoId,
      depositoId: args.depositoId,
      controleKey: "SEM_CONTROLE"
    }
  };

  const saldo = await tx.estoqueSaldo.findUnique({ where: chave });
  const anterior = Number(saldo?.quantidade ?? 0);
  const delta = args.remover ? -args.quantidade : args.quantidade;
  const posterior = anterior + delta;

  if (posterior < 0 && !args.permiteNegativo) {
    throw new ReclassificacaoError(
      `Saldo insuficiente para tirar o SKU ${args.sku} do estoque (saldo ${anterior}, precisa de ${args.quantidade}). ` +
        "O item provavelmente já foi vendido ou consumido — nesse caso o custo da saída saiu pela finalidade antiga " +
        "e a correção precisa ser feita pelo estorno da entrada."
    );
  }

  // Custo médio ponderado — a conta fica em `custo-medio.ts`, onde é testada.
  const custoMedio = custoMedioApos({
    saldoAnterior: anterior,
    custoMedioAnterior: args.custoMedioAtual,
    quantidade: args.quantidade,
    custoUnitario: args.custoUnitario,
    remover: args.remover
  });

  await tx.estoqueSaldo.upsert({
    where: chave,
    update: { quantidade: posterior },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId: args.produtoId,
      depositoId: args.depositoId,
      controleKey: "SEM_CONTROLE",
      quantidade: posterior
    }
  });

  await tx.estoqueMovimento.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId: args.produtoId,
      depositoId: args.depositoId,
      tipo: "AJUSTE",
      quantidade: delta,
      saldoAntes: anterior,
      saldoDepois: posterior,
      custoUnitario: args.custoUnitario,
      custoTotal: args.remover ? -args.custoTotal : args.custoTotal,
      documentoTipo: "RECLASSIFICACAO_FINALIDADE",
      documentoId: args.entradaId,
      // Idempotência por item + sentido: reclassificar de ida e volta gera dois movimentos distintos.
      idempotencyKey: `reclass-finalidade:${args.itemId}:${args.remover ? "saida" : "entrada"}:${Date.now()}`,
      observacoes: args.descricao
    }
  });

  await tx.produto.update({ where: { id: args.produtoId }, data: { custoMedio } });
}

/**
 * Aplica a nova finalidade a um item já processado, refazendo estoque, CFOP, crédito e CIAP.
 * Reaproveita `applyFinalidadeManual`, a mesma regra que a conferência usa — se a regra de CFOP
 * ou de crédito mudar, muda nos dois caminhos de uma vez.
 */
export async function reclassificarFinalidadeItem(
  scope: TenantScope,
  itemId: string,
  novaFinalidade: FinalidadeEntrada,
  opcoes?: { cfopEntrada?: string | null; motivo?: string | null },
  usuarioId?: string
) {
  return prisma.$transaction(
    async (tx) => {
      const item = await tx.entradaFiscalItem.findFirst({
        where: { id: itemId, ...scopedByTenantCompany(scope) },
        include: {
          impostos: true,
          produto: { select: { id: true, sku: true, custoMedio: true, precoCusto: true, permiteEstoqueNegativo: true } },
          entradaFiscal: {
            select: {
              id: true,
              status: true,
              numero: true,
              chaveAcesso: true,
              fornecedorId: true,
              emitidaEm: true,
              recebidaEm: true
            }
          }
        }
      });
      if (!item) throw new ReclassificacaoError("Item da entrada fiscal não encontrado.");

      const entrada = item.entradaFiscal;
      if (entrada.status !== "ESTOQUE_PROCESSADO") {
        throw new ReclassificacaoError(
          "Esta entrada ainda não foi processada: altere a finalidade direto na conferência, que é mais simples."
        );
      }
      if (item.finalidade === novaFinalidade) {
        throw new ReclassificacaoError("O item já está com essa finalidade.");
      }

      const movimentaAntes = item.movimentaEstoque;
      const movimentaDepois = finalidadeMovimentaEstoque(novaFinalidade);
      const fator = Number(item.fatorConversao) > 0 ? Number(item.fatorConversao) : 1;
      const quantidade = Number(item.quantidade) * fator;
      const custoUnitario = Number(item.valorUnitario) / fator;

      if (movimentaAntes !== movimentaDepois) {
        if (!item.produtoId || !item.produto) {
          throw new ReclassificacaoError(
            "Este item não tem produto vinculado, então não dá para ajustar o estoque. Vincule um produto antes de reclassificar."
          );
        }
        const deposito = await tx.deposito.findFirst({
          where: { tenantId: scope.tenantId, empresaId: scope.empresaId, nome: DEPOSITO_PADRAO },
          select: { id: true }
        });
        if (!deposito) throw new ReclassificacaoError("Depósito padrão da entrada fiscal não encontrado.");

        await ajustarEstoque(tx, scope, {
          produtoId: item.produtoId,
          depositoId: deposito.id,
          quantidade,
          custoUnitario,
          custoTotal: Number(item.valorTotal),
          remover: movimentaAntes,
          entradaId: entrada.id,
          itemId: item.id,
          sku: item.produto.sku,
          permiteNegativo: item.produto.permiteEstoqueNegativo,
          custoMedioAtual: Number(item.produto.custoMedio ?? item.produto.precoCusto ?? custoUnitario),
          descricao:
            `Reclassificação de finalidade (${item.finalidade ?? "—"} → ${novaFinalidade}) ` +
            `na NF-e ${entrada.numero || entrada.chaveAcesso || entrada.id}` +
            (opcoes?.motivo?.trim() ? `. Motivo: ${opcoes.motivo.trim()}` : "")
        });
      }

      // Finalidade, CFOP derivado, movimentaEstoque e crédito por tributo — mesma regra da conferência.
      await applyFinalidadeManual(
        tx,
        scope,
        {
          id: item.id,
          cfopEntradaDerivado: item.cfopEntradaDerivado,
          fornecedorId: entrada.fornecedorId,
          impostos: item.impostos as never
        },
        novaFinalidade,
        opcoes?.cfopEntrada ?? null
      );

      // CIAP: o bem do ativo existe por causa da finalidade IMOBILIZADO. Saiu dela, o bem sai junto.
      if (item.finalidade === "IMOBILIZADO" && novaFinalidade !== "IMOBILIZADO") {
        await tx.ciapBem.deleteMany({
          where: { tenantId: scope.tenantId, empresaId: scope.empresaId, entradaFiscalItemId: item.id }
        });
      }

      await createAuditLog(tx, {
        scope,
        entidade: "EntradaFiscalItem",
        entidadeId: item.id,
        acao: "RECLASSIFICAR_FINALIDADE",
        payload: {
          entradaFiscalId: entrada.id,
          de: item.finalidade,
          para: novaFinalidade,
          ajusteEstoque: movimentaAntes === movimentaDepois ? "nenhum" : movimentaAntes ? "removido" : "incluido",
          quantidade,
          motivo: opcoes?.motivo?.trim() || null
        },
        usuarioId
      });

      return { itemId: item.id, finalidade: novaFinalidade, ajusteEstoque: movimentaAntes !== movimentaDepois };
    },
    { maxWait: 10000, timeout: 20000 }
  );
}
