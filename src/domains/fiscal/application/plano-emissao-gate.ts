import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";

/**
 * GATE do plano: limita as emissões mensais conforme o PlataformaPlano do tenant (ex.: Emissor de
 * Notas = 20 notas/mês — preço/limite editáveis pelo dono em /admin/planos). Conta as notas do
 * TENANT (todas as empresas) que chegaram à SEFAZ/SEFIN no mês (AUTORIZADA/CANCELADA/SUBSTITUIDA —
 * cancelar não devolve a cota). Plano sem limite (null) ou COMPLETO → passa direto.
 */
export class LimiteNotasPlanoError extends Error {
  code = "LIMITE_NOTAS_PLANO" as const;
  constructor(limite: number, emitidas: number, planoNome: string) {
    super(
      `Limite de ${limite} nota(s)/mês do plano ${planoNome} atingido (${emitidas} emitidas este mês). ` +
      `Fale com o suporte para fazer upgrade e continuar emitindo.`
    );
  }
}

export async function assertLimiteNotasDoPlano(scope: TenantScope): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { plano: true } });
  if (!tenant || tenant.plano === "COMPLETO") return;

  const plano = await prisma.plataformaPlano.findUnique({ where: { codigo: tenant.plano } });
  if (!plano || plano.limiteNotasMes == null) return;

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const emitidas = await prisma.notaFiscal.count({
    where: {
      tenantId: scope.tenantId,
      status: { in: ["AUTORIZADA", "CANCELADA", "SUBSTITUIDA"] },
      emitidaEm: { gte: inicioMes }
    }
  });
  if (emitidas >= plano.limiteNotasMes) {
    throw new LimiteNotasPlanoError(plano.limiteNotasMes, emitidas, plano.nome);
  }
}
