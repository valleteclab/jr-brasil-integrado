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

export type EmissorSetupStatus = {
  /** true = pode emitir (todas as pendências obrigatórias resolvidas). */
  completo: boolean;
  pendencias: Array<{ titulo: string; descricao: string; link: string; obrigatorio: boolean }>;
};

/**
 * CHECKLIST de configuração do Emissor: o que ainda falta para conseguir emitir notas.
 * Obrigatórios: endereço fiscal completo (sai na NF-e) e certificado A1 (assina tudo).
 * Recomendados: IE (NF-e de produto) e IM (NFS-e de serviço).
 */
export async function getEmissorSetupStatus(scope: TenantScope): Promise<EmissorSetupStatus> {
  const [empresa, certificado] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id: scope.empresaId },
      select: {
        inscricaoEstadual: true,
        inscricaoMunicipal: true,
        enderecoLogradouro: true,
        enderecoNumero: true,
        enderecoBairro: true,
        enderecoCidade: true,
        enderecoUf: true,
        enderecoCep: true,
        codigoMunicipioIbge: true
      }
    }),
    prisma.certificadoDigital.findUnique({ where: { empresaId: scope.empresaId }, select: { validade: true } })
  ]);

  const pendencias: EmissorSetupStatus["pendencias"] = [];
  const enderecoOk = Boolean(
    empresa?.enderecoLogradouro && empresa.enderecoNumero && empresa.enderecoBairro &&
    empresa.enderecoCidade && empresa.enderecoUf && empresa.enderecoCep && empresa.codigoMunicipioIbge
  );
  if (!enderecoOk) {
    pendencias.push({
      titulo: "Complete o endereço da empresa",
      descricao: "Logradouro, número, bairro, cidade, UF, CEP e código IBGE saem impressos na nota — a SEFAZ exige todos.",
      link: "/erp/configuracoes/empresa",
      obrigatorio: true
    });
  }
  if (!certificado) {
    pendencias.push({
      titulo: "Envie o certificado digital A1 (.pfx)",
      descricao: "É ele que assina as notas. Use o mesmo arquivo que seu contador usa, com a senha.",
      link: "/erp/configuracoes/fiscal",
      obrigatorio: true
    });
  } else if (certificado.validade && certificado.validade.getTime() < Date.now()) {
    pendencias.push({
      titulo: "Certificado A1 vencido — renove e envie o novo",
      descricao: "Com o certificado vencido a SEFAZ recusa a emissão. Renove com sua certificadora e envie o novo .pfx.",
      link: "/erp/configuracoes/fiscal",
      obrigatorio: true
    });
  }
  if (!empresa?.inscricaoMunicipal) {
    pendencias.push({
      titulo: "Informe a inscrição municipal",
      descricao: "Necessária para emitir NFS-e (nota de serviço). Se você só emite NF-e de produto, pode pular.",
      link: "/erp/configuracoes/empresa",
      obrigatorio: false
    });
  }
  if (!empresa?.inscricaoEstadual) {
    pendencias.push({
      titulo: "Informe a inscrição estadual",
      descricao: "Necessária para emitir NF-e de produto. Se você só presta serviços (NFS-e), pode pular.",
      link: "/erp/configuracoes/empresa",
      obrigatorio: false
    });
  }

  return { completo: !pendencias.some((p) => p.obrigatorio), pendencias };
}

/** Dados da home do plano Emissor: notas do mês, últimas notas, certificado e resumo Simples/MEI. */
export async function getEmissorHomeData(): Promise<EmissorHomeData> {
  const scope: TenantScope = await getDevelopmentTenantScope();
  const baseAmb = scopedByTenantCompanyAmbiente(scope);
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const [empresa, agregadoMes, ultimas, certificado, setup] = await Promise.all([
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
    prisma.certificadoDigital.findUnique({ where: { empresaId: scope.empresaId }, select: { validade: true } }),
    getEmissorSetupStatus(scope)
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
    setup,
    mesAnterior: (() => {
      const d = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
      return { mes: d.getMonth() + 1, ano: d.getFullYear(), label: d.toLocaleDateString("pt-BR", { month: "long" }) };
    })(),
    simples
  };
}
