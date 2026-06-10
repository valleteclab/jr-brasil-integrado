/**
 * Use cases do módulo SPED Fiscal (EFD ICMS/IPI).
 *
 * Módulo liberado POR TENANT pelo dono do SaaS (Tenant.spedFiscalHabilitado) — toda
 * operação valida o gate antes de tocar nos dados, além do escopo tenant/empresa.
 */

import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { carregarSpedInput, SpedError } from "@/domains/fiscal/sped/dados";
import { gerarSpedFiscal } from "@/domains/fiscal/sped/gerador";
import type { SpedResumo } from "@/domains/fiscal/sped/types";

export { SpedError };

/** Lança SpedError se o módulo não estiver liberado para o tenant pelo dono do SaaS. */
export async function assertSpedHabilitado(scope: TenantScope): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { spedFiscalHabilitado: true }
  });
  if (!tenant?.spedFiscalHabilitado) {
    throw new SpedError("O módulo SPED Fiscal não está liberado para esta conta. Fale com o suporte da plataforma.");
  }
}

/** Versão silenciosa do gate, para esconder menu/telas sem lançar erro. */
export async function isSpedHabilitado(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { spedFiscalHabilitado: true } });
  return Boolean(tenant?.spedFiscalHabilitado);
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

export type GerarSpedInput = {
  ano: number;
  mes: number;
  finalidade?: "ORIGINAL" | "RETIFICADORA";
};

export type SpedArquivoResultado = {
  id: string;
  competencia: string;
  totalLinhas: number;
  avisos: string[];
};

export async function gerarSpedArquivo(
  scope: TenantScope,
  input: GerarSpedInput,
  usuarioId?: string
): Promise<SpedArquivoResultado> {
  await assertSpedHabilitado(scope);

  const dados = await carregarSpedInput(scope, input);
  const gerado = gerarSpedFiscal(dados);

  const base = { tenantId: scope.tenantId, empresaId: scope.empresaId };
  const arquivo = await prisma.$transaction(async (tx) => {
    const salvo = await tx.spedArquivo.upsert({
      where: { tenantId_empresaId_ano_mes: { ...base, ano: input.ano, mes: input.mes } },
      update: {
        versaoLeiaute: dados.versaoLeiaute,
        finalidade: dados.config.finalidade,
        perfilArquivo: dados.config.perfilArquivo,
        status: "GERADO",
        conteudo: gerado.conteudo,
        totalLinhas: gerado.totalLinhas,
        resumo: gerado.resumo as object,
        avisos: gerado.avisos as unknown as object,
        saldoCredorAnterior: dados.config.saldoCredorAnterior,
        geradoPor: usuarioId ?? null,
        enviadoContadorEm: null
      },
      create: {
        ...base,
        ano: input.ano,
        mes: input.mes,
        versaoLeiaute: dados.versaoLeiaute,
        finalidade: dados.config.finalidade,
        perfilArquivo: dados.config.perfilArquivo,
        status: "GERADO",
        conteudo: gerado.conteudo,
        totalLinhas: gerado.totalLinhas,
        resumo: gerado.resumo as object,
        avisos: gerado.avisos as unknown as object,
        saldoCredorAnterior: dados.config.saldoCredorAnterior,
        geradoPor: usuarioId ?? null
      }
    });
    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "SpedArquivo",
      entidadeId: salvo.id,
      acao: "sped.gerar",
      payload: { ano: input.ano, mes: input.mes, finalidade: dados.config.finalidade, totalLinhas: gerado.totalLinhas }
    });
    return salvo;
  });

  return {
    id: arquivo.id,
    competencia: gerado.resumo.competencia,
    totalLinhas: gerado.totalLinhas,
    avisos: gerado.avisos
  };
}

// ---------------------------------------------------------------------------
// Listagem / detalhe / download
// ---------------------------------------------------------------------------

export type SpedArquivoSummary = {
  id: string;
  ano: number;
  mes: number;
  competencia: string;
  versaoLeiaute: string;
  finalidade: string;
  status: "GERADO" | "ENVIADO_CONTADOR";
  totalLinhas: number;
  icmsARecolher: number;
  saldoCredorTransportar: number;
  totalAvisos: number;
  enviadoContadorEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

function resumoDe(arquivo: { resumo: unknown }): SpedResumo | null {
  if (arquivo.resumo && typeof arquivo.resumo === "object") return arquivo.resumo as SpedResumo;
  return null;
}

export async function listSpedArquivos(scope: TenantScope): Promise<SpedArquivoSummary[]> {
  await assertSpedHabilitado(scope);
  const arquivos = await prisma.spedArquivo.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: [{ ano: "desc" }, { mes: "desc" }]
  });
  return arquivos.map((a) => {
    const resumo = resumoDe(a);
    const avisos = Array.isArray(a.avisos) ? (a.avisos as unknown[]) : [];
    return {
      id: a.id,
      ano: a.ano,
      mes: a.mes,
      competencia: `${String(a.mes).padStart(2, "0")}/${a.ano}`,
      versaoLeiaute: a.versaoLeiaute,
      finalidade: a.finalidade,
      status: a.status,
      totalLinhas: a.totalLinhas,
      icmsARecolher: Number(resumo?.apuracaoIcms?.icmsARecolher ?? 0),
      saldoCredorTransportar: Number(resumo?.apuracaoIcms?.saldoCredorTransportar ?? 0),
      totalAvisos: avisos.length,
      enviadoContadorEm: a.enviadoContadorEm?.toISOString() ?? null,
      criadoEm: a.criadoEm.toISOString(),
      atualizadoEm: a.atualizadoEm.toISOString()
    };
  });
}

export type SpedArquivoDetalhe = {
  id: string;
  ano: number;
  mes: number;
  competencia: string;
  versaoLeiaute: string;
  finalidade: string;
  perfilArquivo: string;
  status: "GERADO" | "ENVIADO_CONTADOR";
  totalLinhas: number;
  resumo: SpedResumo | null;
  avisos: string[];
  enviadoContadorEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

export async function getSpedArquivoDetalhe(scope: TenantScope, id: string): Promise<SpedArquivoDetalhe | null> {
  await assertSpedHabilitado(scope);
  const a = await prisma.spedArquivo.findFirst({
    where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId }
  });
  if (!a) return null;
  return {
    id: a.id,
    ano: a.ano,
    mes: a.mes,
    competencia: `${String(a.mes).padStart(2, "0")}/${a.ano}`,
    versaoLeiaute: a.versaoLeiaute,
    finalidade: a.finalidade,
    perfilArquivo: a.perfilArquivo,
    status: a.status,
    totalLinhas: a.totalLinhas,
    resumo: resumoDe(a),
    avisos: Array.isArray(a.avisos) ? (a.avisos as string[]) : [],
    enviadoContadorEm: a.enviadoContadorEm?.toISOString() ?? null,
    criadoEm: a.criadoEm.toISOString(),
    atualizadoEm: a.atualizadoEm.toISOString()
  };
}

export type SpedDownload = { nomeArquivo: string; conteudo: string };

export async function getSpedArquivoConteudo(scope: TenantScope, id: string): Promise<SpedDownload> {
  await assertSpedHabilitado(scope);
  const a = await prisma.spedArquivo.findFirst({
    where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId },
    select: { ano: true, mes: true, conteudo: true, empresa: { select: { cnpj: true } } }
  });
  if (!a) throw new SpedError("Arquivo SPED não encontrado.");
  const cnpj = (a.empresa.cnpj ?? "").replace(/\D/g, "") || "EMPRESA";
  const nomeArquivo = `EFD_ICMS_IPI_${cnpj}_${String(a.mes).padStart(2, "0")}${a.ano}.txt`;
  return { nomeArquivo, conteudo: a.conteudo };
}

export async function marcarEnviadoContador(scope: TenantScope, id: string, usuarioId?: string) {
  await assertSpedHabilitado(scope);
  const a = await prisma.spedArquivo.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!a) throw new SpedError("Arquivo SPED não encontrado.");
  const atualizado = await prisma.$transaction(async (tx) => {
    const salvo = await tx.spedArquivo.update({
      where: { id: a.id },
      data: { status: "ENVIADO_CONTADOR", enviadoContadorEm: new Date() }
    });
    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "SpedArquivo",
      entidadeId: a.id,
      acao: "sped.marcar_enviado",
      payload: { ano: a.ano, mes: a.mes }
    });
    return salvo;
  });
  return { id: atualizado.id, status: atualizado.status, enviadoContadorEm: atualizado.enviadoContadorEm?.toISOString() ?? null };
}

export async function excluirSpedArquivo(scope: TenantScope, id: string, usuarioId?: string) {
  await assertSpedHabilitado(scope);
  const a = await prisma.spedArquivo.findFirst({ where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!a) throw new SpedError("Arquivo SPED não encontrado.");
  await prisma.$transaction(async (tx) => {
    await tx.spedArquivo.delete({ where: { id: a.id } });
    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "SpedArquivo",
      entidadeId: a.id,
      acao: "sped.excluir",
      payload: { ano: a.ano, mes: a.mes }
    });
  });
  return { id: a.id, ok: true };
}

// ---------------------------------------------------------------------------
// Configuração (perfil, contador, E116)
// ---------------------------------------------------------------------------

export type SpedConfiguracaoView = {
  perfilArquivo: string;
  indAtividade: string;
  contadorNome: string;
  contadorCpf: string;
  contadorCrc: string;
  contadorCnpj: string;
  contadorCep: string;
  contadorEndereco: string;
  contadorNumero: string;
  contadorComplemento: string;
  contadorBairro: string;
  contadorTelefone: string;
  contadorEmail: string;
  contadorCodigoMunicipioIbge: string;
  codigoReceitaIcms: string;
  diaVencimentoIcms: number;
};

export async function getSpedConfiguracao(scope: TenantScope): Promise<SpedConfiguracaoView> {
  await assertSpedHabilitado(scope);
  const c = await prisma.spedConfiguracao.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId }
  });
  return {
    perfilArquivo: c?.perfilArquivo ?? "B",
    indAtividade: c?.indAtividade ?? "1",
    contadorNome: c?.contadorNome ?? "",
    contadorCpf: c?.contadorCpf ?? "",
    contadorCrc: c?.contadorCrc ?? "",
    contadorCnpj: c?.contadorCnpj ?? "",
    contadorCep: c?.contadorCep ?? "",
    contadorEndereco: c?.contadorEndereco ?? "",
    contadorNumero: c?.contadorNumero ?? "",
    contadorComplemento: c?.contadorComplemento ?? "",
    contadorBairro: c?.contadorBairro ?? "",
    contadorTelefone: c?.contadorTelefone ?? "",
    contadorEmail: c?.contadorEmail ?? "",
    contadorCodigoMunicipioIbge: c?.contadorCodigoMunicipioIbge ?? "",
    codigoReceitaIcms: c?.codigoReceitaIcms ?? "",
    diaVencimentoIcms: c?.diaVencimentoIcms ?? 10
  };
}

export async function saveSpedConfiguracao(
  scope: TenantScope,
  input: Partial<SpedConfiguracaoView>,
  usuarioId?: string
): Promise<SpedConfiguracaoView> {
  await assertSpedHabilitado(scope);

  const perfil = (input.perfilArquivo ?? "B").toUpperCase();
  if (!["A", "B", "C"].includes(perfil)) throw new SpedError("Perfil do arquivo inválido (use A, B ou C).");
  const indAtividade = input.indAtividade === "0" ? "0" : "1";
  const dia = Number(input.diaVencimentoIcms ?? 10);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
    throw new SpedError("Dia de vencimento do ICMS inválido (1 a 28).");
  }
  const limpo = (v: string | undefined) => (v ?? "").trim() || null;

  const data = {
    perfilArquivo: perfil,
    indAtividade,
    contadorNome: limpo(input.contadorNome),
    contadorCpf: limpo(input.contadorCpf),
    contadorCrc: limpo(input.contadorCrc),
    contadorCnpj: limpo(input.contadorCnpj),
    contadorCep: limpo(input.contadorCep),
    contadorEndereco: limpo(input.contadorEndereco),
    contadorNumero: limpo(input.contadorNumero),
    contadorComplemento: limpo(input.contadorComplemento),
    contadorBairro: limpo(input.contadorBairro),
    contadorTelefone: limpo(input.contadorTelefone),
    contadorEmail: limpo(input.contadorEmail),
    contadorCodigoMunicipioIbge: limpo(input.contadorCodigoMunicipioIbge),
    codigoReceitaIcms: limpo(input.codigoReceitaIcms),
    diaVencimentoIcms: dia
  };

  await prisma.$transaction(async (tx) => {
    const existente = await tx.spedConfiguracao.findFirst({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
      select: { id: true }
    });
    const salvo = existente
      ? await tx.spedConfiguracao.update({ where: { id: existente.id }, data })
      : await tx.spedConfiguracao.create({ data: { tenantId: scope.tenantId, empresaId: scope.empresaId, ...data } });
    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "SpedConfiguracao",
      entidadeId: salvo.id,
      acao: "sped.salvar_configuracao",
      payload: { perfilArquivo: perfil, indAtividade }
    });
  });

  return getSpedConfiguracao(scope);
}
