import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { carregarCertificado } from "@/domains/fiscal/application/certificado-use-cases";
import { getFiscalRuntimeConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { buildLoteGnreXml, consultarResultadoGnre, enviarLoteGnre } from "@/domains/fiscal/providers/gnre/gnre-ws";

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
  linhaDigitavel: string | null;
  situacaoWs: string | null;
  temPdf: boolean;
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
    linhaDigitavel: g.linhaDigitavel,
    situacaoWs: g.situacaoWs,
    temPdf: Boolean(g.pdfBase64),
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

const pickXml = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
};

/**
 * EMITE a guia no WEBSERVICE GNRE (lote v2.00, mTLS com o A1 da empresa): a guia referencia a
 * CHAVE da NF-e (documento de origem tipo 10); o resultado traz linha digitável, código de barras
 * e o PDF — salvos na própria GuiaRecolhimento. Exige o CNPJ HABILITADO no Portal GNRE
 * (credenciamento único em gnre.pe.gov.br → Automação; sem ele o serviço responde situação 102).
 * O ambiente segue o da NOTA (homologação → testegnre).
 */
export async function emitirGuiaGnre(
  scope: TenantScope,
  id: string,
  usuarioId?: string,
  opts?: { tipoDocOrigem?: string; produto?: string | null; receita?: string | null; ieSubstituto?: string | null }
) {
  const guia = await prisma.guiaRecolhimento.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: { notaFiscal: { select: { chaveAcesso: true, numero: true, xml: true, ambiente: true, status: true } } }
  });
  if (!guia) throw new GuiaError("Guia não encontrada.");
  if (guia.status !== "PENDENTE") throw new GuiaError(`A guia não está pendente (${guia.status}).`);
  if (!guia.notaFiscal.chaveAcesso) throw new GuiaError("A NF-e da guia não tem chave de acesso.");
  if (guia.notaFiscal.status !== "AUTORIZADA") throw new GuiaError("A NF-e da guia não está autorizada.");

  const certificado = await carregarCertificado(scope);
  if (!certificado) throw new GuiaError("Certificado A1 da empresa não cadastrado (Configurações → Fiscal).");
  const config = await getFiscalRuntimeConfig(scope);

  // Destinatário extraído do XML autorizado da própria nota (fonte da verdade da operação).
  const xml = guia.notaFiscal.xml ?? "";
  const destBloco = xml.match(/<dest>[\s\S]*?<\/dest>/)?.[0] ?? "";
  const destinatario = destBloco
    ? {
        cnpj: pickXml(destBloco, "CNPJ"),
        ie: pickXml(destBloco, "IE"),
        razaoSocial: pickXml(destBloco, "xNome"),
        codigoMunicipioIbge: pickXml(destBloco, "cMun")
      }
    : null;

  const produto = opts?.produto !== undefined ? opts.produto : guia.produtoGnre;
  // Documento de origem: tipo 10 = Nota Fiscal, com o NÚMERO da NF-e (não a chave) — é o formato
  // aceito pelas UFs na receita 100048 (testado no portal de testes; os tipos de "chave" 22/24
  // existem no domínio mas as UFs não os habilitam para esta receita).
  const docOrigem = opts?.tipoDocOrigem && opts.tipoDocOrigem !== "10"
    ? guia.notaFiscal.chaveAcesso
    : (guia.notaFiscal.numero ?? "").replace(/\D+/g, "") || guia.notaFiscal.chaveAcesso;
  const lote = buildLoteGnreXml({
    ufFavorecida: guia.ufFavorecida,
    // Receita por UF (GnreConfigUF): vem da regra tributária (guia.receitaGnre) — ex.: PR usa
    // 100099 (ST por operação); default 100048 (aceito no DF). DIFAL: 100102 por operação.
    receita: guia.tipo === "GNRE_DIFAL" ? "100102" : (opts?.receita ?? guia.receitaGnre ?? "100048"),
    chaveNfe: docOrigem,
    tipoDocOrigem: opts?.tipoDocOrigem,
    produto,
    valor: Number(guia.valor),
    dataVencimento: new Date(),
    dataPagamento: new Date(),
    emitente: {
      cnpj: config.emitter.cnpj,
      // IE do emitente na GNRE = inscrição NA UF FAVORECIDA (IE de substituto tributário na UF
      // destino — Quadro II cód. 202). A IE da UF de origem NÃO vai aqui: emitente não inscrito
      // identifica-se só pelo CNPJ. Override via opts p/ empresas com IE de substituto na UF.
      ie: opts?.ieSubstituto ?? null,
      razaoSocial: config.emitter.razaoSocial,
      endereco: `${config.emitter.logradouro ?? ""} ${config.emitter.numero ?? ""}`.trim() || "SEM ENDERECO",
      codigoMunicipioIbge: config.emitter.codigoMunicipioIbge ?? "",
      uf: config.emitter.uf ?? "",
      cep: config.emitter.cep,
      telefone: config.emitter.telefone
    },
    destinatario
  });

  const ambienteWs = guia.notaFiscal.ambiente === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO";
  const recibo = await enviarLoteGnre({ pfx: certificado.pfx, senha: certificado.senha }, ambienteWs, lote);
  await prisma.guiaRecolhimento.update({ where: { id }, data: { reciboLote: recibo, situacaoWs: "ENVIADA", produtoGnre: produto ?? null } });

  // Poll do resultado — o Manual v2.11 (4.2.3) manda aguardar NO MÍNIMO 30s antes da 1ª
  // consulta (evita 401 "Lote em Processamento"); depois reconsulta a cada 10s.
  const auth = { pfx: certificado.pfx, senha: certificado.senha };
  let ultimo: Awaited<ReturnType<typeof consultarResultadoGnre>> | null = null;
  await new Promise((resolve) => setTimeout(resolve, 30000));
  for (let i = 0; i < 3; i++) {
    ultimo = await consultarResultadoGnre(auth, ambienteWs, recibo);
    if (ultimo.representacaoNumerica || ultimo.erros.length) break;
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  if (!ultimo) throw new GuiaError("Sem resposta do portal GNRE — consulte novamente em instantes.");
  if (ultimo.erros.length && !ultimo.representacaoNumerica) {
    await prisma.guiaRecolhimento.update({ where: { id }, data: { situacaoWs: `REJEITADA: ${ultimo.erros.join("; ").slice(0, 500)}` } });
    throw new GuiaError(`GNRE rejeitou a guia: ${ultimo.erros.join("; ")}`);
  }

  // Guia processada: UMA consulta final pedindo o PDF (só o incluirPDFGuias=S faz o portal
  // devolver o pdfGuias — e é mais lenta, por isso fica fora do poll).
  if (ultimo.representacaoNumerica && !ultimo.pdfBase64) {
    const comPdf = await consultarResultadoGnre(auth, ambienteWs, recibo, true);
    if (comPdf.pdfBase64) ultimo = comPdf;
  }

  const atualizada = await prisma.guiaRecolhimento.update({
    where: { id },
    data: {
      situacaoWs: "EMITIDA",
      numeroGuia: ultimo.representacaoNumerica ?? guia.numeroGuia,
      linhaDigitavel: ultimo.representacaoNumerica,
      codigoBarras: ultimo.codigoBarras,
      pdfBase64: ultimo.pdfBase64
    }
  });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId, entidade: "GuiaRecolhimento", entidadeId: id, acao: "EMITIDA_WS",
    payload: { recibo, uf: guia.ufFavorecida, valor: Number(guia.valor), linhaDigitavel: ultimo?.representacaoNumerica ?? null }
  }));
  return atualizada;
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
