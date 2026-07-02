import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * GUIAS DE RECOLHIMENTO ESTADUAL (GNRE) geradas pela emissão interestadual com ICMS-ST retido
 * (Conv. ICMS 142/2018, cl. 18ª: recolher POR OPERAÇÃO antes da saída; a guia acompanha o
 * transporte). O ERP registra e controla; a guia é emitida no portal GNRE Online.
 */

export class GuiaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuiaError";
  }
}

export type GuiaResumo = {
  id: string;
  tipo: string;
  ufFavorecida: string;
  valor: number;
  status: string;
  numeroGuia: string | null;
  pagoEm: string | null;
  criadoEm: string;
  nota: { id: string; numero: string | null; chaveAcesso: string | null; emitidaEm: string | null; total: number; status: string };
};

export async function listGuias(scope: TenantScope): Promise<GuiaResumo[]> {
  const guias = await prisma.guiaRecolhimento.findMany({
    where: scopedByTenantCompany(scope),
    orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
    take: 300,
    include: { notaFiscal: { select: { id: true, numero: true, chaveAcesso: true, emitidaEm: true, total: true, status: true } } }
  });
  return guias.map((g) => ({
    id: g.id,
    tipo: g.tipo,
    ufFavorecida: g.ufFavorecida,
    valor: Number(g.valor),
    status: g.status,
    numeroGuia: g.numeroGuia,
    pagoEm: g.pagoEm?.toISOString() ?? null,
    criadoEm: g.criadoEm.toISOString(),
    nota: {
      id: g.notaFiscal.id,
      numero: g.notaFiscal.numero,
      chaveAcesso: g.notaFiscal.chaveAcesso,
      emitidaEm: g.notaFiscal.emitidaEm?.toISOString() ?? null,
      total: Number(g.notaFiscal.total),
      status: g.notaFiscal.status
    }
  }));
}

/** Marca a guia como PAGA (nº da guia do portal GNRE + data) ou volta para PENDENTE. */
export async function atualizarGuia(
  scope: TenantScope,
  id: string,
  input: { status: "PAGA" | "PENDENTE" | "CANCELADA"; numeroGuia?: string | null; pagoEm?: Date | null },
  usuarioId?: string
) {
  const guia = await prisma.guiaRecolhimento.findFirst({ where: { id, ...scopedByTenantCompany(scope) } });
  if (!guia) throw new GuiaError("Guia não encontrada.");
  const atualizada = await prisma.guiaRecolhimento.update({
    where: { id },
    data: {
      status: input.status,
      numeroGuia: input.numeroGuia !== undefined ? input.numeroGuia?.trim() || null : guia.numeroGuia,
      pagoEm: input.status === "PAGA" ? input.pagoEm ?? new Date() : null
    }
  });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId, entidade: "GuiaRecolhimento", entidadeId: id, acao: input.status,
    payload: { tipo: guia.tipo, uf: guia.ufFavorecida, valor: Number(guia.valor), numeroGuia: input.numeroGuia ?? null }
  }));
  return atualizada;
}
