import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { avaliarDuplicidade, JANELA_DIAS, LIMITE_SUSPEITA, type CandidataDuplicidade } from "./duplicidade-despesa";

/** Conta a pagar que parece ser a mesma despesa, com o porquê. */
export type SuspeitaDuplicidade = {
  contaPagarId: string;
  descricao: string;
  valor: number;
  data: string;
  origem: string | null;
  pontuacao: number;
  motivos: string[];
};

/**
 * Procura, entre as contas a pagar já existentes, alguma que seja a MESMA despesa que está
 * sendo lançada agora. Usada antes de criar a despesa da NFS-e e no relatório de revisão.
 *
 * O filtro pesado (valor e janela de datas) vai no banco; a pontuação fina é feita em memória,
 * sobre um conjunto pequeno.
 */
export async function buscarSuspeitasDuplicidade(
  scope: TenantScope,
  nova: { valor: number; data: Date; descricao: string; fornecedorId?: string | null },
  ignorarContaPagarId?: string
): Promise<SuspeitaDuplicidade[]> {
  const de = new Date(nova.data);
  de.setDate(de.getDate() - JANELA_DIAS);
  const ate = new Date(nova.data);
  ate.setDate(ate.getDate() + JANELA_DIAS);

  const candidatas = await prisma.contaPagar.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      status: { not: "CANCELADO" },
      valor: { gte: nova.valor - 0.02, lte: nova.valor + 0.02 },
      OR: [{ vencimento: { gte: de, lte: ate } }, { pagoEm: { gte: de, lte: ate } }],
      ...(ignorarContaPagarId ? { id: { not: ignorarContaPagarId } } : {})
    },
    select: {
      id: true,
      descricao: true,
      valor: true,
      vencimento: true,
      pagoEm: true,
      origem: true,
      fornecedorId: true,
      entradaFiscalId: true
    },
    take: 50
  });

  const suspeitas: SuspeitaDuplicidade[] = [];
  for (const c of candidatas) {
    const candidata: CandidataDuplicidade = {
      id: c.id,
      descricao: c.descricao,
      valor: Number(c.valor),
      data: c.pagoEm ?? c.vencimento,
      origem: c.origem,
      fornecedorId: c.fornecedorId,
      temNota: Boolean(c.entradaFiscalId)
    };
    const { pontuacao, motivos } = avaliarDuplicidade(nova, candidata);
    if (pontuacao >= LIMITE_SUSPEITA) {
      suspeitas.push({
        contaPagarId: c.id,
        descricao: c.descricao,
        valor: candidata.valor,
        data: candidata.data.toISOString(),
        origem: c.origem,
        pontuacao,
        motivos
      });
    }
  }

  return suspeitas.sort((a, b) => b.pontuacao - a.pontuacao);
}

/** Par de contas a pagar que parecem a mesma despesa. */
export type ParDuplicado = {
  manter: { id: string; descricao: string; valor: number; data: string; origem: string | null; pago: boolean };
  remover: { id: string; descricao: string; valor: number; data: string; origem: string | null; pago: boolean };
  pontuacao: number;
  motivos: string[];
};

/**
 * Varre as contas a pagar procurando pares que sejam a mesma despesa lançada duas vezes.
 *
 * Mantém sempre a conta COM pagamento (o dinheiro realmente saiu por ela) e propõe remover a que
 * está em aberto. Quando as duas estão em aberto, mantém a mais antiga.
 */
export async function listarDespesasDuplicadas(scope: TenantScope, diasParaTras = 120): Promise<ParDuplicado[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - diasParaTras);

  const contas = await prisma.contaPagar.findMany({
    where: { ...scopedByTenantCompany(scope), status: { not: "CANCELADO" }, vencimento: { gte: desde } },
    select: {
      id: true,
      descricao: true,
      valor: true,
      valorPago: true,
      vencimento: true,
      pagoEm: true,
      origem: true,
      fornecedorId: true,
      entradaFiscalId: true
    },
    orderBy: { vencimento: "asc" }
  });

  const pares: ParDuplicado[] = [];
  const jaUsadas = new Set<string>();

  for (let i = 0; i < contas.length; i += 1) {
    const a = contas[i];
    if (jaUsadas.has(a.id)) continue;
    for (let j = i + 1; j < contas.length; j += 1) {
      const b = contas[j];
      if (jaUsadas.has(b.id)) continue;

      const dadosA = { valor: Number(a.valor), data: a.pagoEm ?? a.vencimento, descricao: a.descricao, fornecedorId: a.fornecedorId };
      const { pontuacao, motivos } = avaliarDuplicidade(dadosA, {
        id: b.id,
        descricao: b.descricao,
        valor: Number(b.valor),
        data: b.pagoEm ?? b.vencimento,
        origem: b.origem,
        fornecedorId: b.fornecedorId,
        temNota: Boolean(b.entradaFiscalId)
      });
      if (pontuacao < LIMITE_SUSPEITA) continue;

      const pagoA = Number(a.valorPago) > 0;
      const pagoB = Number(b.valorPago) > 0;
      // Preserva a conta por onde o dinheiro saiu; sem pagamento em nenhuma, fica a mais antiga.
      const manterA = pagoA || (!pagoB && a.vencimento <= b.vencimento);
      const manter = manterA ? a : b;
      const remover = manterA ? b : a;

      pares.push({
        manter: {
          id: manter.id,
          descricao: manter.descricao,
          valor: Number(manter.valor),
          data: (manter.pagoEm ?? manter.vencimento).toISOString(),
          origem: manter.origem,
          pago: Number(manter.valorPago) > 0
        },
        remover: {
          id: remover.id,
          descricao: remover.descricao,
          valor: Number(remover.valor),
          data: (remover.pagoEm ?? remover.vencimento).toISOString(),
          origem: remover.origem,
          pago: Number(remover.valorPago) > 0
        },
        pontuacao,
        motivos
      });
      jaUsadas.add(a.id);
      jaUsadas.add(b.id);
      break;
    }
  }

  return pares.sort((x, y) => y.pontuacao - x.pontuacao);
}

/**
 * Resolve a duplicidade: move os vínculos da conta removida para a mantida e apaga a removida.
 * Só apaga conta SEM pagamento — se as duas tiveram dinheiro saindo, não é duplicata de
 * lançamento, é pagamento feito duas vezes, e isso se resolve com estorno.
 */
export async function mesclarDespesasDuplicadas(
  scope: TenantScope,
  manterId: string,
  removerId: string,
  usuarioId?: string
) {
  if (manterId === removerId) throw new Error("Informe duas contas diferentes.");

  return prisma.$transaction(async (tx) => {
    const [manter, remover] = await Promise.all([
      tx.contaPagar.findFirst({ where: { id: manterId, ...scopedByTenantCompany(scope) }, select: { id: true, fornecedorId: true } }),
      tx.contaPagar.findFirst({
        where: { id: removerId, ...scopedByTenantCompany(scope) },
        select: { id: true, valorPago: true, descricao: true, fornecedorId: true, entradaFiscalId: true }
      })
    ]);
    if (!manter || !remover) throw new Error("Conta a pagar não encontrada.");
    if (Number(remover.valorPago) > 0) {
      throw new Error(
        "A conta que seria removida tem pagamento registrado. Estorne a baixa antes, ou mescle no outro sentido."
      );
    }
    if (remover.entradaFiscalId) {
      throw new Error("A conta que seria removida veio de uma entrada fiscal — estorne a entrada em vez de mesclar.");
    }

    // A nota fiscal passa a apontar para a conta que fica.
    await tx.distribuicaoNfseDocumento.updateMany({
      where: { contaPagarId: removerId, ...scopedByTenantCompany(scope) },
      data: { contaPagarId: manterId }
    });

    // Fornecedor costuma estar só na conta que veio da nota: preserva o dado.
    if (!manter.fornecedorId && remover.fornecedorId) {
      await tx.contaPagar.update({ where: { id: manterId }, data: { fornecedorId: remover.fornecedorId } });
    }

    await tx.contaPagar.delete({ where: { id: removerId } });

    await createAuditLog(tx, {
      scope,
      entidade: "ContaPagar",
      entidadeId: manterId,
      acao: "MESCLAR_DESPESA_DUPLICADA",
      payload: { removida: removerId, descricaoRemovida: remover.descricao },
      usuarioId
    });

    return { manterId, removidoId: removerId };
  });
}
