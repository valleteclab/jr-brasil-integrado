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
import { dadosDaChave, parseXmlSped, SpedXmlError } from "@/domains/fiscal/sped/xml-avulso";
import { callOpenRouter } from "@/domains/ai/openrouter-service";
import { Prisma } from "@prisma/client";

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
        enviadoContadorEm: null,
        // Regerar invalida a análise anterior da IA (ela se referia à apuração antiga).
        analiseIa: Prisma.JsonNull,
        analiseIaEm: null
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

export type SpedAnaliseIa = {
  texto: string;
  geradoEm: string;
};

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
  analiseIa: SpedAnaliseIa | null;
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
    analiseIa:
      a.analiseIa && typeof a.analiseIa === "object" && typeof (a.analiseIa as Record<string, unknown>).texto === "string"
        ? (a.analiseIa as SpedAnaliseIa)
        : null,
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

// ---------------------------------------------------------------------------
// XMLs avulsos (notas emitidas fora do ERP / recebidas sem o fluxo de entradas)
// ---------------------------------------------------------------------------

export type ImportarXmlResultado = {
  ok: boolean;
  chaveAcesso: string | null;
  mensagem: string;
};

export async function importarSpedXmls(
  scope: TenantScope,
  xmls: string[],
  usuarioId?: string
): Promise<ImportarXmlResultado[]> {
  await assertSpedHabilitado(scope);
  if (!Array.isArray(xmls) || xmls.length === 0) throw new SpedError("Envie ao menos um XML.");
  if (xmls.length > 200) throw new SpedError("Envie no máximo 200 XMLs por vez.");

  const base = { tenantId: scope.tenantId, empresaId: scope.empresaId };
  const empresa = await prisma.empresa.findFirst({
    where: { id: scope.empresaId, tenantId: scope.tenantId },
    select: { cnpj: true }
  });
  if (!empresa) throw new SpedError("Empresa não encontrada para o escopo atual.");
  const cnpjEmpresa = (empresa.cnpj ?? "").replace(/\D/g, "");

  const resultados: ImportarXmlResultado[] = [];
  let importados = 0;

  for (const xml of xmls) {
    try {
      const parsed = parseXmlSped(xml);

      if (parsed.kind === "CANCELAMENTO") {
        const chave = parsed.chaveAcesso;
        const existente = await prisma.spedXmlDocumento.findUnique({
          where: { tenantId_empresaId_chaveAcesso: { ...base, chaveAcesso: chave } }
        });
        if (existente) {
          await prisma.spedXmlDocumento.update({ where: { id: existente.id }, data: { cancelada: true } });
          resultados.push({ ok: true, chaveAcesso: chave, mensagem: "Cancelamento aplicado à nota já importada." });
        } else {
          // Sem a nota: cria um stub cancelado a partir dos dados embutidos na própria chave
          // (o C100 de cancelada só precisa da identificação do documento).
          const d = dadosDaChave(chave);
          await prisma.spedXmlDocumento.create({
            data: {
              ...base,
              chaveAcesso: chave,
              tipo: d.emitenteDocumento === cnpjEmpresa ? "SAIDA" : "ENTRADA",
              cancelada: true,
              modelo: d.modelo,
              numero: d.numero,
              serie: d.serie,
              emitidaEm: new Date(d.ano, d.mes - 1, 1),
              competenciaAno: d.ano,
              competenciaMes: d.mes,
              emitenteDocumento: d.emitenteDocumento,
              xml
            }
          });
          resultados.push({
            ok: true,
            chaveAcesso: chave,
            mensagem: "Cancelamento registrado (nota cancelada incluída só com a identificação)."
          });
        }
        importados++;
        continue;
      }

      const chave = parsed.chaveAcesso;

      // Nota já escriturada pelo fluxo normal do ERP? Não duplica.
      const [notaExistente, entradaExistente] = await Promise.all([
        prisma.notaFiscal.findFirst({ where: { ...base, chaveAcesso: chave }, select: { id: true } }),
        prisma.entradaFiscal.findFirst({ where: { ...base, chaveAcesso: chave }, select: { id: true } })
      ]);
      if (notaExistente || entradaExistente) {
        resultados.push({
          ok: false,
          chaveAcesso: chave,
          mensagem: "Nota já existe no sistema (emitida ou importada pelo fluxo de entradas) — XML ignorado."
        });
        continue;
      }

      const tipo = parsed.emitente.documento === cnpjEmpresa ? "SAIDA" : "ENTRADA";
      const dadosChave = dadosDaChave(chave);
      const competencia = parsed.emitidaEm ?? new Date(dadosChave.ano, dadosChave.mes - 1, 1);

      const dadosDoc = {
        tipo,
        modelo: parsed.modelo,
        numero: parsed.numero,
        serie: parsed.serie,
        emitidaEm: parsed.emitidaEm,
        competenciaAno: competencia.getFullYear(),
        competenciaMes: competencia.getMonth() + 1,
        emitenteDocumento: parsed.emitente.documento,
        emitenteNome: parsed.emitente.nome,
        destinatarioDocumento: parsed.destinatario?.documento ?? null,
        destinatarioNome: parsed.destinatario?.nome ?? null,
        valorTotal: parsed.totais.valorNota,
        xml
      };
      await prisma.spedXmlDocumento.upsert({
        where: { tenantId_empresaId_chaveAcesso: { ...base, chaveAcesso: chave } },
        update: dadosDoc,
        create: { ...base, chaveAcesso: chave, ...dadosDoc }
      });
      importados++;
      const compLabel = `${String(competencia.getMonth() + 1).padStart(2, "0")}/${competencia.getFullYear()}`;
      resultados.push({
        ok: true,
        chaveAcesso: chave,
        mensagem: `${tipo === "SAIDA" ? "Saída" : "Entrada"} ${parsed.modelo === "65" ? "NFC-e" : "NF-e"} ${parsed.numero} — competência ${compLabel}.`
      });
    } catch (e) {
      resultados.push({
        ok: false,
        chaveAcesso: null,
        mensagem: e instanceof SpedXmlError || e instanceof SpedError ? e.message : "Falha ao processar o XML."
      });
    }
  }

  if (importados > 0) {
    await prisma.$transaction(async (tx) => {
      await createAuditLog(tx, {
        scope,
        usuarioId,
        entidade: "SpedXmlDocumento",
        entidadeId: scope.empresaId,
        acao: "sped.importar_xml",
        payload: { recebidos: xmls.length, importados }
      });
    });
  }

  return resultados;
}

export type SpedXmlSummary = {
  id: string;
  chaveAcesso: string;
  tipo: string;
  cancelada: boolean;
  modelo: string | null;
  numero: string | null;
  serie: string | null;
  competencia: string;
  emitenteNome: string | null;
  destinatarioNome: string | null;
  valorTotal: number;
  criadoEm: string;
};

export async function listSpedXmlDocumentos(scope: TenantScope): Promise<SpedXmlSummary[]> {
  await assertSpedHabilitado(scope);
  const docs = await prisma.spedXmlDocumento.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: [{ competenciaAno: "desc" }, { competenciaMes: "desc" }, { criadoEm: "desc" }],
    take: 300
  });
  return docs.map((d) => ({
    id: d.id,
    chaveAcesso: d.chaveAcesso,
    tipo: d.tipo,
    cancelada: d.cancelada,
    modelo: d.modelo,
    numero: d.numero,
    serie: d.serie,
    competencia: `${String(d.competenciaMes).padStart(2, "0")}/${d.competenciaAno}`,
    emitenteNome: d.emitenteNome,
    destinatarioNome: d.destinatarioNome,
    valorTotal: Number(d.valorTotal),
    criadoEm: d.criadoEm.toISOString()
  }));
}

export async function excluirSpedXmlDocumento(scope: TenantScope, id: string, usuarioId?: string) {
  await assertSpedHabilitado(scope);
  const doc = await prisma.spedXmlDocumento.findFirst({
    where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId }
  });
  if (!doc) throw new SpedError("XML não encontrado.");
  await prisma.$transaction(async (tx) => {
    await tx.spedXmlDocumento.delete({ where: { id: doc.id } });
    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "SpedXmlDocumento",
      entidadeId: doc.id,
      acao: "sped.excluir_xml",
      payload: { chaveAcesso: doc.chaveAcesso }
    });
  });
  return { id: doc.id, ok: true };
}

// ---------------------------------------------------------------------------
// Análise da apuração por IA (OpenRouter) — a IA AUDITA o resumo, nunca gera o arquivo
// ---------------------------------------------------------------------------

export async function analisarSpedComIa(scope: TenantScope, id: string, usuarioId?: string): Promise<SpedAnaliseIa> {
  await assertSpedHabilitado(scope);
  const arquivo = await prisma.spedArquivo.findFirst({
    where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId }
  });
  if (!arquivo) throw new SpedError("Arquivo SPED não encontrado.");
  const resumo = (arquivo.resumo ?? null) as SpedResumo | null;
  if (!resumo) throw new SpedError("Arquivo sem resumo de apuração — regere o SPED.");
  const avisos = Array.isArray(arquivo.avisos) ? (arquivo.avisos as string[]) : [];

  // Compacta o resumo para o prompt (somente dados fiscais agregados, sem dados pessoais).
  const dados = {
    competencia: resumo.competencia,
    regimeTributario: resumo.regimeTributario,
    leiaute: resumo.versaoLeiaute,
    perfil: resumo.perfilArquivo,
    documentos: resumo.documentos,
    apuracaoIcms: resumo.apuracaoIcms,
    apuracaoIcmsSt: resumo.apuracaoIcmsSt,
    apuracaoIpi: resumo.apuracaoIpi,
    pisCofinsInformativo: resumo.pisCofins,
    saidasPorCfop: resumo.saidasPorCfop.slice(0, 40),
    entradasPorCfop: resumo.entradasPorCfop.slice(0, 40),
    avisosDaGeracao: avisos.slice(0, 40)
  };

  const texto = await callOpenRouter(
    scope,
    [
      {
        role: "system",
        content:
          "Você é um auditor fiscal brasileiro sênior, especialista em EFD ICMS/IPI (SPED Fiscal, leiaute 020/2026) e na transição da reforma tributária (CBS/IBS informativos em 2026, fora da EFD ICMS/IPI). " +
          "Você recebe o RESUMO da apuração de um arquivo gerado por um sistema determinístico — você NÃO gera o arquivo, apenas audita. " +
          "Responda em português do Brasil, objetivo e didático, nesta estrutura: " +
          "1) PARECER GERAL (2-3 frases sobre a consistência da apuração); " +
          "2) INCONSISTÊNCIAS E RISCOS (verifique: coerência CST × CFOP × alíquota nas linhas analíticas; CFOPs de devolução/ST; créditos de entrada compatíveis com o regime tributário; ICMS-ST; alíquotas atípicas; impacto dos avisos da geração); " +
          "3) CHECKLIST ANTES DE ENVIAR AO CONTADOR (itens acionáveis e curtos). " +
          "Aponte SOMENTE o que os dados sustentam; quando faltar informação, diga o que verificar em vez de inventar. Não invente valores."
      },
      {
        role: "user",
        content: `Audite esta apuração do SPED Fiscal:\n\n${JSON.stringify(dados, null, 1)}`
      }
    ],
    { maxTokens: 1400, temperature: 0.1 }
  );

  const analise: SpedAnaliseIa = { texto: texto.trim(), geradoEm: new Date().toISOString() };

  await prisma.$transaction(async (tx) => {
    await tx.spedArquivo.update({
      where: { id: arquivo.id },
      data: { analiseIa: analise as unknown as Prisma.InputJsonValue, analiseIaEm: new Date() }
    });
    await createAuditLog(tx, {
      scope,
      usuarioId,
      entidade: "SpedArquivo",
      entidadeId: arquivo.id,
      acao: "sped.analise_ia",
      payload: { ano: arquivo.ano, mes: arquivo.mes }
    });
  });

  return analise;
}
