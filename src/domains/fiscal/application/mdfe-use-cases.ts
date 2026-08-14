import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { getFiscalRuntimeConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import {
  MDFE_ENDPOINTS, MDFE_WSDL, MDFE_SOAP_ACTION,
  buildMdfeXml, buildEventoMdfe, mdfeRecepcaoPayload, insertMdfeSupl, dhBrasilia
} from "@/domains/fiscal/providers/sefaz/mdfe/mdfe-xml";
import { soapEnvelope, postSoap, pickTag } from "@/domains/fiscal/providers/sefaz/soap";
import { signXml, pfxToPem } from "@/domains/fiscal/providers/sefaz/sign";
import { CODIGO_UF } from "@/domains/fiscal/providers/sefaz/endpoints";
import { createAuditLog } from "@/lib/audit/audit-service";

/**
 * MDF-e (modelo 58, carga própria): emissão síncrona na SVRS, encerramento na chegada e
 * cancelamento (24h). Emitente sai do cadastro da empresa; A1 do cofre. Ciclo validado
 * em HOM em 2026-08-13 (autorização cStat 100 + encerramento 135).
 */

export type EmitirMdfeInput = {
  ufInicio: string;
  ufFim: string;
  percurso?: string[];
  municipioDescarga: { codigoIbge: string; nome: string };
  veiculo: { placa: string; tara: number; tipoRodado?: string; tipoCarroceria?: string };
  condutor: { nome: string; cpf: string };
  chavesNfe: string[];
  valorCarga: number;
  pesoBrutoKg: number;
  observacao?: string | null;
};

const mdfeSoap = (wsdlNs: string, inner: string) =>
  soapEnvelope(wsdlNs, inner).replace(/nfeDadosMsg/g, "mdfeDadosMsg");

export async function emitirMdfe(scope: TenantScope, input: EmitirMdfeInput) {
  const runtime = await getFiscalRuntimeConfig(scope);
  if (!runtime.certificado?.pfx) {
    throw new Error("Certificado A1 não configurado — necessário para assinar o MDF-e (Configurações → Fiscal).");
  }
  const empresa = await prisma.empresa.findFirst({ where: { id: scope.empresaId, tenantId: scope.tenantId } });
  if (!empresa) throw new Error("Empresa não encontrada.");
  if (!empresa.inscricaoEstadual) throw new Error("Informe a Inscrição Estadual da empresa (cadastro) — obrigatória no MDF-e.");
  if (!empresa.codigoMunicipioIbge) throw new Error("Informe o código IBGE do município da empresa (cadastro fiscal).");
  if (!input.chavesNfe.length) throw new Error("Selecione ao menos uma NF-e transportada.");

  const ultimo = await prisma.manifesto.aggregate({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ambiente: runtime.ambiente },
    _max: { numero: true }
  });
  const numero = (ultimo._max.numero ?? 0) + 1;

  const { xml, chave } = buildMdfeXml({
    ambiente: runtime.ambiente,
    serie: 1,
    numero,
    emitente: {
      cnpj: empresa.cnpj,
      inscricaoEstadual: empresa.inscricaoEstadual,
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia,
      uf: empresa.enderecoUf ?? input.ufInicio,
      codigoMunicipioIbge: empresa.codigoMunicipioIbge,
      municipio: empresa.enderecoCidade ?? "",
      logradouro: empresa.enderecoLogradouro,
      numeroEndereco: empresa.enderecoNumero,
      bairro: empresa.enderecoBairro,
      cep: empresa.enderecoCep,
      fone: empresa.telefone
    },
    ufInicio: input.ufInicio,
    ufFim: input.ufFim,
    percurso: input.percurso,
    municipioCarregamento: { codigoIbge: empresa.codigoMunicipioIbge, nome: empresa.enderecoCidade ?? "" },
    veiculo: {
      placa: input.veiculo.placa,
      tara: input.veiculo.tara,
      tipoRodado: input.veiculo.tipoRodado ?? "06",
      tipoCarroceria: input.veiculo.tipoCarroceria ?? "02"
    },
    condutores: [{ nome: input.condutor.nome, cpf: input.condutor.cpf }],
    descargas: [{ codigoIbge: input.municipioDescarga.codigoIbge, nome: input.municipioDescarga.nome, chavesNfe: input.chavesNfe }],
    valorCarga: input.valorCarga,
    pesoBrutoKg: input.pesoBrutoKg,
    infoAdicional: input.observacao ?? null
  });

  const { privateKeyPem, certPem } = pfxToPem(runtime.certificado.pfx, runtime.certificado.senha);
  const assinado = insertMdfeSupl(signXml(xml, "infMDFe", privateKeyPem, certPem), chave, runtime.ambiente);
  const env = mdfeSoap(MDFE_WSDL.recepcaoSinc, mdfeRecepcaoPayload(assinado));
  const res = await postSoap(MDFE_ENDPOINTS[runtime.ambiente].recepcaoSinc, env, runtime.certificado, MDFE_SOAP_ACTION.recepcaoSinc, 90000);
  const plain = res.body.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const cStat = pickTag(plain, "cStat") ?? "";
  const xMotivo = pickTag(plain, "xMotivo") ?? "";
  const nProt = pickTag(plain, "nProt") ?? null;
  const autorizado = cStat === "100";

  const manifesto = await prisma.manifesto.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      ambiente: runtime.ambiente,
      serie: 1,
      numero,
      chave: autorizado ? chave : null,
      status: autorizado ? "AUTORIZADO" : "REJEITADO",
      protocolo: nProt,
      motivo: autorizado ? null : `${cStat}: ${xMotivo}`.slice(0, 900),
      xml: autorizado ? assinado : null,
      ufInicio: input.ufInicio.toUpperCase(),
      ufFim: input.ufFim.toUpperCase(),
      municipioCarregaNome: empresa.enderecoCidade ?? "",
      municipioCarregaIbge: empresa.codigoMunicipioIbge,
      municipioDescargaNome: input.municipioDescarga.nome,
      municipioDescargaIbge: input.municipioDescarga.codigoIbge,
      veiculoPlaca: input.veiculo.placa.toUpperCase(),
      veiculoTara: Math.round(input.veiculo.tara),
      tipoRodado: input.veiculo.tipoRodado ?? "06",
      tipoCarroceria: input.veiculo.tipoCarroceria ?? "02",
      condutorNome: input.condutor.nome,
      condutorCpf: input.condutor.cpf.replace(/\D/g, ""),
      chavesNfe: input.chavesNfe,
      valorCarga: input.valorCarga,
      pesoBrutoKg: input.pesoBrutoKg
    }
  });

  await createAuditLog(prisma, {
    scope,
    entidade: "Manifesto",
    entidadeId: manifesto.id,
    acao: autorizado ? "MDFE_AUTORIZADO" : "MDFE_REJEITADO",
    payload: { chave, cStat, xMotivo, nProt }
  });

  return { id: manifesto.id, autorizado, chave, cStat, xMotivo, protocolo: nProt, numero };
}

async function enviarEvento(scope: TenantScope, manifestoId: string, tipo: "ENCERRAMENTO" | "CANCELAMENTO", extra: { municipioIbge?: string; uf?: string; justificativa?: string }) {
  const runtime = await getFiscalRuntimeConfig(scope);
  if (!runtime.certificado?.pfx) throw new Error("Certificado A1 não configurado.");
  const m = await prisma.manifesto.findFirst({ where: { id: manifestoId, tenantId: scope.tenantId, empresaId: scope.empresaId } });
  if (!m || !m.chave || !m.protocolo) throw new Error("Manifesto autorizado não encontrado.");

  const empresa = await prisma.empresa.findFirst({ where: { id: scope.empresaId }, select: { cnpj: true } });
  const evento =
    tipo === "ENCERRAMENTO"
      ? {
          tipo: "ENCERRAMENTO" as const,
          nProt: m.protocolo,
          dtEnc: dhBrasilia().slice(0, 10),
          cUf: CODIGO_UF[(extra.uf ?? m.ufFim).toUpperCase()] ?? m.chave.slice(0, 2),
          cMun: extra.municipioIbge ?? m.municipioDescargaIbge
        }
      : { tipo: "CANCELAMENTO" as const, nProt: m.protocolo, justificativa: extra.justificativa ?? "Cancelamento solicitado pelo emitente" };

  const { xml } = buildEventoMdfe({ ambiente: m.ambiente, chave: m.chave, cnpj: empresa?.cnpj ?? "", evento });
  const { privateKeyPem, certPem } = pfxToPem(runtime.certificado.pfx, runtime.certificado.senha);
  const assinado = signXml(xml, "infEvento", privateKeyPem, certPem).replace(/^<\?xml[^>]*\?>/, "");
  const env = mdfeSoap(MDFE_WSDL.evento, assinado);
  const res = await postSoap(MDFE_ENDPOINTS[m.ambiente].evento, env, runtime.certificado, MDFE_SOAP_ACTION.evento, 60000);
  const plain = res.body.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const cStat = pickTag(plain, "cStat") ?? "";
  const xMotivo = pickTag(plain, "xMotivo") ?? "";
  const ok = cStat === "135" || cStat === "136";

  if (ok) {
    await prisma.manifesto.update({
      where: { id: m.id },
      data: tipo === "ENCERRAMENTO" ? { status: "ENCERRADO", encerradoEm: new Date() } : { status: "CANCELADO" }
    });
  }
  await createAuditLog(prisma, {
    scope, entidade: "Manifesto", entidadeId: m.id,
    acao: `MDFE_${tipo}${ok ? "" : "_FALHA"}`, payload: { cStat, xMotivo }
  });
  return { ok, cStat, xMotivo };
}

export function encerrarMdfe(scope: TenantScope, id: string, extra?: { municipioIbge?: string; uf?: string }) {
  return enviarEvento(scope, id, "ENCERRAMENTO", extra ?? {});
}

export function cancelarMdfe(scope: TenantScope, id: string, justificativa: string) {
  if ((justificativa ?? "").trim().length < 15) throw new Error("Justificativa de cancelamento deve ter ao menos 15 caracteres.");
  return enviarEvento(scope, id, "CANCELAMENTO", { justificativa });
}

export async function listarMdfe(scope: TenantScope) {
  const rows = await prisma.manifesto.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: { criadoEm: "desc" },
    take: 100
  });
  return rows.map((m) => ({
    id: m.id,
    numero: m.numero,
    chave: m.chave,
    status: m.status,
    motivo: m.motivo,
    ufInicio: m.ufInicio,
    ufFim: m.ufFim,
    destino: m.municipioDescargaNome,
    placa: m.veiculoPlaca,
    condutor: m.condutorNome,
    qtdNotas: Array.isArray(m.chavesNfe) ? (m.chavesNfe as string[]).length : 0,
    valorCarga: Number(m.valorCarga),
    criadoEm: m.criadoEm.toISOString(),
    encerradoEm: m.encerradoEm?.toISOString() ?? null
  }));
}

/** NF-e autorizadas recentes (para vincular ao manifesto). */
export async function listarNfesParaManifesto(scope: TenantScope) {
  const notas = await prisma.notaFiscal.findMany({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      modelo: "NFE",
      status: "AUTORIZADA",
      chaveAcesso: { not: null }
    },
    orderBy: { criadoEm: "desc" },
    take: 50,
    select: { id: true, numero: true, chaveAcesso: true, total: true, criadoEm: true, destinatarioNome: true }
  });
  return notas.map((n) => ({
    id: n.id,
    numero: n.numero,
    chave: n.chaveAcesso as string,
    total: Number(n.total),
    cliente: n.destinatarioNome,
    emitidaEm: n.criadoEm.toISOString()
  }));
}
