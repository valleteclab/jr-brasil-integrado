import { prisma } from "@/lib/db/prisma";
import { getDevelopmentTenantScope, scopedByTenantCompanyAmbiente, type TenantScope } from "@/lib/auth/dev-session";
import { apuracaoSimples } from "@/domains/fiscal/simples/apuracao-simples-use-cases";
import type { EmissorHomeData } from "@/components/erp/EmissorHome";

/** O tenant do usuário logado está no plano EMISSOR? (decide a home do /erp). */
export async function planoDoTenantAtual(): Promise<"COMPLETO" | "EMISSOR"> {
  try {
    const scope = await getDevelopmentTenantScope();
    const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { plano: true } });
    return tenant?.plano === "EMISSOR" ? "EMISSOR" : "COMPLETO";
  } catch {
    return "COMPLETO";
  }
}

/** Dados da home do plano Emissor: notas do mês, últimas notas, certificado e resumo Simples/MEI. */
export async function getEmissorHomeData(): Promise<EmissorHomeData> {
  const scope: TenantScope = await getDevelopmentTenantScope();
  const baseAmb = scopedByTenantCompanyAmbiente(scope);
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const [empresa, agregadoMes, ultimas, certificado] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: scope.empresaId }, select: { razaoSocial: true, nomeFantasia: true } }),
    prisma.notaFiscal.aggregate({
      where: { ...baseAmb, status: "AUTORIZADA", emitidaEm: { gte: inicioMes } },
      _count: { _all: true },
      _sum: { total: true }
    }),
    prisma.notaFiscal.findMany({
      where: { ...baseAmb, status: { not: "RASCUNHO" } },
      orderBy: { criadoEm: "desc" },
      take: 5,
      select: { id: true, numero: true, numeroNfse: true, modelo: true, status: true, total: true, emitidaEm: true }
    }),
    prisma.certificadoDigital.findUnique({ where: { empresaId: scope.empresaId }, select: { validade: true } })
  ]);

  // Resumo do Simples/MEI — opcional (empresa fora do Simples ou sem anexo configurado → some).
  let simples: EmissorHomeData["simples"] = null;
  try {
    const ap = await apuracaoSimples(scope, { mes: agora.getMonth() + 1, ano: agora.getFullYear() });
    simples = {
      regime: ap.regime,
      receitaMes: ap.receitaMes,
      das: ap.dasComSegregacao ?? null,
      mei: ap.mei,
      alertas: ap.alertas ?? []
    };
  } catch {
    simples = null;
  }

  const diasParaVencer = certificado?.validade
    ? Math.ceil((certificado.validade.getTime() - Date.now()) / 86400000)
    : null;

  return {
    empresaNome: empresa?.nomeFantasia ?? empresa?.razaoSocial ?? "sua empresa",
    notasMes: { quantidade: agregadoMes._count._all, valor: Number(agregadoMes._sum.total ?? 0) },
    ultimasNotas: ultimas.map((n) => ({
      id: n.id,
      numero: n.numeroNfse ?? n.numero ?? "",
      modelo: n.modelo,
      status: n.status,
      total: Number(n.total),
      emitidaEm: n.emitidaEm?.toISOString() ?? null
    })),
    certificado: { configurado: Boolean(certificado), validade: certificado?.validade?.toISOString() ?? null, diasParaVencer },
    simples
  };
}
