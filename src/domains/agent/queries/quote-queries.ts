import type { Prisma, StatusOrcamento } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";

const STATUS: StatusOrcamento[] = ["RASCUNHO", "EM_ANALISE", "AGUARDANDO_CLIENTE", "APROVADO", "EXPIRADO", "REJEITADO", "CONVERTIDO"];

export async function listQuotesForAgent(
  scope: TenantScope,
  input: { numero?: string; cliente?: string; status?: string; periodoDias?: number; limite?: number }
) {
  const numero = input.numero?.trim();
  const cliente = input.cliente?.trim();
  const documento = cliente?.replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  const status = STATUS.includes(input.status as StatusOrcamento) ? (input.status as StatusOrcamento) : undefined;
  const periodo = Number(input.periodoDias);
  const limite = Math.min(Math.max(Number(input.limite) || 20, 1), 50);
  const criadoDepoisDe = Number.isFinite(periodo) && periodo > 0
    ? new Date(Date.now() - Math.min(periodo, 3650) * 86_400_000)
    : undefined;

  const where: Prisma.OrcamentoWhereInput = {
    ...scopedByTenantCompanyAmbiente(scope),
    ...(numero ? { numero: { contains: numero, mode: "insensitive" } } : {}),
    ...(status ? { status } : {}),
    ...(criadoDepoisDe ? { criadoEm: { gte: criadoDepoisDe } } : {}),
    ...(cliente
      ? {
          cliente: {
            OR: [
              { razaoSocial: { contains: cliente, mode: "insensitive" } },
              { nomeFantasia: { contains: cliente, mode: "insensitive" } },
              ...(documento ? [{ documento: { contains: documento } }] : [])
            ]
          }
        }
      : {})
  };

  const [totalEncontrado, orcamentos] = await prisma.$transaction([
    prisma.orcamento.count({ where }),
    prisma.orcamento.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: limite,
      select: {
        id: true,
        numero: true,
        status: true,
        canal: true,
        total: true,
        validoAte: true,
        condicaoPagamento: true,
        observacaoVendedor: true,
        pedidoGeradoId: true,
        criadoEm: true,
        cliente: { select: { razaoSocial: true, nomeFantasia: true, documento: true } },
        itens: {
          orderBy: { id: "asc" },
          select: {
            quantidade: true,
            precoUnitario: true,
            total: true,
            produto: { select: { sku: true, nome: true } }
          }
        }
      }
    })
  ]);

  return {
    totalEncontrado,
    exibidos: orcamentos.length,
    orcamentos: orcamentos.map((orcamento) => ({
      orcamentoId: orcamento.id,
      numero: orcamento.numero,
      status: orcamento.status,
      canal: orcamento.canal,
      cliente: orcamento.cliente.nomeFantasia ?? orcamento.cliente.razaoSocial,
      clienteDocumento: orcamento.cliente.documento,
      total: Number(orcamento.total),
      validoAte: orcamento.validoAte?.toISOString().slice(0, 10) ?? null,
      condicaoPagamento: orcamento.condicaoPagamento,
      observacao: orcamento.observacaoVendedor,
      convertidoEmPedido: Boolean(orcamento.pedidoGeradoId),
      criadoEm: orcamento.criadoEm.toISOString(),
      itens: numero
        ? orcamento.itens.map((item) => ({
            sku: item.produto.sku,
            produto: item.produto.nome,
            quantidade: Number(item.quantidade),
            precoUnitario: Number(item.precoUnitario),
            total: Number(item.total)
          }))
        : undefined
    }))
  };
}
