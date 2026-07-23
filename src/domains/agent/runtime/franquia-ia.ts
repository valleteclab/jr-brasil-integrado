import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";

/**
 * FRANQUIA mensal de INTERAÇÕES DE IA por plano (PlataformaPlano.franquiaIaMes):
 *  - null = ilimitado · 0 = IA desligada no plano · N = N mensagens de IA/mês.
 *  - 1 interação = 1 mensagem do usuário processada pelo agente (conversa livre ou foto de cupom).
 *  - Fluxos guiados por botão NÃO contam (não usam LLM) — o cliente nunca fica "trancado".
 * Uso registrado em UsoIaMensal (tenantId + competência "YYYY-MM").
 */

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type FranquiaIaResultado =
  | { ok: true; usadas: number; franquia: number | null }
  | { ok: false; motivo: string; usadas: number; franquia: number };

/**
 * Verifica a franquia e, se houver saldo, CONSOME 1 interação. Falha do banco não trava a IA
 * (fail-open: melhor atender do que negar por erro interno).
 */
export async function consumirFranquiaIa(scope: TenantScope): Promise<FranquiaIaResultado> {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { plano: true } });
    const plano = tenant ? await prisma.plataformaPlano.findUnique({ where: { codigo: tenant.plano } }) : null;
    const franquia = plano?.franquiaIaMes ?? null;
    const competencia = competenciaAtual();

    const uso = await prisma.usoIaMensal.findUnique({
      where: { tenantId_competencia: { tenantId: scope.tenantId, competencia } },
      select: { interacoes: true }
    });
    const usadas = uso?.interacoes ?? 0;

    if (franquia != null && usadas >= franquia) {
      const motivo =
        franquia === 0
          ? "O assistente de IA não está incluso no seu plano. Fale com o suporte para ativar."
          : `Suas ${franquia} interações de IA do mês acabaram. O menu de botões continua funcionando normalmente (digite /menu). Para ampliar a franquia, fale com o suporte.`;
      return { ok: false, motivo, usadas, franquia };
    }

    await prisma.usoIaMensal.upsert({
      where: { tenantId_competencia: { tenantId: scope.tenantId, competencia } },
      create: { tenantId: scope.tenantId, competencia, interacoes: 1 },
      update: { interacoes: { increment: 1 } }
    });
    return { ok: true, usadas: usadas + 1, franquia };
  } catch (e) {
    console.warn("[franquia-ia]", e instanceof Error ? e.message : e);
    return { ok: true, usadas: 0, franquia: null }; // fail-open
  }
}
