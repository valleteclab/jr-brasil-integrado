import type { AmbienteFiscal, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { getFiscalRuntimeConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { importNfeXml } from "@/domains/products/application/fiscal-entry-use-cases";

const ACBR_AUTH_URL = "https://auth.acbr.api.br/realms/ACBrAPI/protocol/openid-connect/token";
const ACBR_BASE_URL: Record<AmbienteFiscal, string> = {
  PRODUCAO: "https://prod.acbr.api.br",
  HOMOLOGACAO: "https://hom.acbr.api.br"
};
const ACBR_SCOPES = "empresa nfe nfce nfse conta distribuicao-nfe";

type AcbrEnv = "producao" | "homologacao";

type AcbrDistributionDocument = {
  id: string;
  nsu?: number | string | null;
  schema?: string | null;
  tipo_documento?: string | null;
  chave_acesso?: string | null;
  resumo?: boolean | null;
  tipo_evento?: string | null;
  numero_protocolo?: string | null;
  tipo_nfe?: number | null;
  valor_nfe?: number | null;
  data_emissao?: string | null;
  data_recebimento?: string | null;
  emitente_cpf_cnpj?: string | null;
  emitente_nome_razao_social?: string | null;
  payload?: unknown;
};

type AcbrDistributionResponse = {
  id?: string;
  created_at?: string | null;
  status?: string;
  codigo_status?: number | null;
  motivo_status?: string | null;
  ultimo_nsu?: number | string | null;
  max_nsu?: number | string | null;
  documentos?: AcbrDistributionDocument[];
};

type AcbrListResponse<T> = {
  data?: T[];
  "@count"?: number;
};

type AcbrManifestResponse = {
  id?: string;
  status?: string;
  tipo_evento?: string;
  data_evento?: string;
  motivo_status?: string;
};

type Runtime = Awaited<ReturnType<typeof getFiscalRuntimeConfig>>;

export type NfeDistributionSummary = {
  id: string;
  acbrDocumentoId: string;
  chaveAcesso: string;
  numero: string;
  serie: string;
  nsu: string;
  emitenteNome: string;
  emitenteDocumento: string;
  valor: number;
  dataEmissao: string | null;
  status: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "mute";
  manifestacaoStatus: string | null;
  resumo: boolean | null;
  entradaFiscalId: string | null;
  ultimoErro: string | null;
  canDownloadXml: boolean;
  canDownloadPdf: boolean;
};

class NfeDistributionError extends Error {}

function onlyDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function ambienteApi(value: AmbienteFiscal): AcbrEnv {
  return value === "PRODUCAO" ? "producao" : "homologacao";
}

function dateOrNull(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function accessKeyNumber(chave?: string | null) {
  const digits = onlyDigits(chave);
  return digits.length >= 34 ? digits.slice(25, 34).replace(/^0+/, "") || digits.slice(25, 34) : "";
}

function accessKeySeries(chave?: string | null) {
  const digits = onlyDigits(chave);
  return digits.length >= 25 ? digits.slice(22, 25).replace(/^0+/, "") || digits.slice(22, 25) : "";
}

function statusLabel(status: string, entradaFiscalId: string | null, manifestacaoStatus: string | null) {
  if (entradaFiscalId) return "Importada para conferência";
  if (status === "ERRO") return "Erro";
  if (manifestacaoStatus) return "Ciência enviada";
  return "Recebida";
}

function statusTone(status: string, entradaFiscalId: string | null): NfeDistributionSummary["statusTone"] {
  if (entradaFiscalId) return "success";
  if (status === "ERRO") return "danger";
  if (status === "IMPORTANDO") return "warn";
  return "mute";
}

async function requireAcbrRuntime(scope: TenantScope): Promise<Runtime> {
  const runtime = await getFiscalRuntimeConfig(scope);
  if (runtime.provider !== "ACBR") {
    throw new NfeDistributionError("A distribuição NF-e está disponível apenas para o provedor ACBr.");
  }
  if (!runtime.active) {
    throw new NfeDistributionError("Ative a configuração fiscal da ACBr antes de buscar NF-e recebidas.");
  }
  if (!runtime.token || !runtime.cscId) {
    throw new NfeDistributionError("Configure client_id e client_secret da ACBr em Configurações > Fiscal.");
  }
  if (!runtime.emitter.cnpj) {
    throw new NfeDistributionError("Informe o CNPJ da empresa antes de buscar NF-e recebidas.");
  }
  return runtime;
}

async function getAcbrToken(runtime: Runtime) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: runtime.cscId ?? "",
    client_secret: runtime.token ?? "",
    scope: ACBR_SCOPES
  });
  const response = await fetch(ACBR_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString()
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new NfeDistributionError(data.error_description || data.error || `Falha ao autenticar na ACBr (HTTP ${response.status}).`);
  }
  return data.access_token;
}

async function acbrRequest<T>(runtime: Runtime, method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const token = await getAcbrToken(runtime);
  const baseUrl = (runtime.baseUrl?.trim() || ACBR_BASE_URL[runtime.ambiente]).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text().catch(() => "");
  const data = raw ? JSON.parse(raw) as T : undefined as T;
  if (!response.ok) {
    const anyData = data as { error?: { message?: string }; message?: string };
    throw new NfeDistributionError(anyData?.error?.message || anyData?.message || `ACBr retornou HTTP ${response.status}.`);
  }
  return data;
}

async function acbrDownloadXml(runtime: Runtime, documentId: string) {
  const token = await getAcbrToken(runtime);
  const baseUrl = (runtime.baseUrl?.trim() || ACBR_BASE_URL[runtime.ambiente]).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/distribuicao/nfe/documentos/${encodeURIComponent(documentId)}/xml`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/xml,text/xml,*/*" }
  });
  const xml = await response.text();
  if (!response.ok) {
    throw new NfeDistributionError(`ACBr retornou HTTP ${response.status} ao baixar XML.`);
  }
  if (!xml.includes("<NFe") && !xml.includes("<nfeProc")) {
    throw new NfeDistributionError("O XML baixado ainda não é uma NF-e completa. Faça a ciência e sincronize novamente.");
  }
  return xml;
}

async function acbrDownloadDocument(runtime: Runtime, documentId: string, kind: "pdf" | "xml") {
  const token = await getAcbrToken(runtime);
  const baseUrl = (runtime.baseUrl?.trim() || ACBR_BASE_URL[runtime.ambiente]).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/distribuicao/nfe/documentos/${encodeURIComponent(documentId)}/${kind}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: kind === "pdf" ? "application/pdf,*/*" : "application/xml,text/xml,*/*"
    }
  });
  const contentType = response.headers.get("content-type") || (kind === "pdf" ? "application/pdf" : "application/xml");
  const body = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new NfeDistributionError(`ACBr retornou HTTP ${response.status} ao baixar ${kind.toUpperCase()} do documento.`);
  }
  if (contentType.includes("json")) {
    const text = body.toString("utf8");
    throw new NfeDistributionError(text || `A ACBr nÃ£o retornou ${kind.toUpperCase()} para este documento.`);
  }
  return { body, contentType };
}

async function upsertDocument(scope: TenantScope, runtime: Runtime, doc: AcbrDistributionDocument, acbrDistribuicaoId?: string | null) {
  if (!doc.id) return null;
  const payload = doc as unknown as Prisma.InputJsonValue;
  return prisma.distribuicaoNfeDocumento.upsert({
    where: {
      tenantId_empresaId_acbrDocumentoId: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        acbrDocumentoId: doc.id
      }
    },
    update: {
      acbrDistribuicaoId: acbrDistribuicaoId ?? undefined,
      nsu: doc.nsu == null ? undefined : String(doc.nsu),
      schema: doc.schema ?? undefined,
      tipoDocumento: doc.tipo_documento ?? undefined,
      chaveAcesso: doc.chave_acesso ?? undefined,
      resumo: doc.resumo ?? undefined,
      tipoEvento: doc.tipo_evento ?? undefined,
      numeroProtocolo: doc.numero_protocolo ?? undefined,
      tipoNfe: doc.tipo_nfe ?? undefined,
      valorNfe: doc.valor_nfe == null ? undefined : doc.valor_nfe,
      dataEmissao: dateOrNull(doc.data_emissao) ?? undefined,
      dataRecebimento: dateOrNull(doc.data_recebimento) ?? undefined,
      emitenteDocumento: doc.emitente_cpf_cnpj ?? undefined,
      emitenteNome: doc.emitente_nome_razao_social ?? undefined,
      payload,
      ultimoErro: null
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      acbrDocumentoId: doc.id,
      acbrDistribuicaoId: acbrDistribuicaoId ?? null,
      ambiente: runtime.ambiente,
      nsu: doc.nsu == null ? null : String(doc.nsu),
      schema: doc.schema ?? null,
      tipoDocumento: doc.tipo_documento ?? null,
      chaveAcesso: doc.chave_acesso ?? null,
      resumo: doc.resumo ?? null,
      tipoEvento: doc.tipo_evento ?? null,
      numeroProtocolo: doc.numero_protocolo ?? null,
      tipoNfe: doc.tipo_nfe ?? null,
      valorNfe: doc.valor_nfe ?? null,
      dataEmissao: dateOrNull(doc.data_emissao),
      dataRecebimento: dateOrNull(doc.data_recebimento),
      emitenteDocumento: doc.emitente_cpf_cnpj ?? null,
      emitenteNome: doc.emitente_nome_razao_social ?? null,
      payload,
      status: "LISTADO"
    }
  });
}

async function syncListedDocuments(scope: TenantScope, runtime: Runtime) {
  const cpfCnpj = onlyDigits(runtime.emitter.cnpj);
  const params = new URLSearchParams({
    cpf_cnpj: cpfCnpj,
    ambiente: ambienteApi(runtime.ambiente),
    "$top": "100"
  });
  const list = await acbrRequest<AcbrListResponse<AcbrDistributionDocument>>(runtime, "GET", `/distribuicao/nfe/documentos?${params.toString()}`);
  for (const doc of list.data ?? []) {
    await upsertDocument(scope, runtime, doc);
  }
  return list.data?.length ?? 0;
}

async function getRemoteDistributionState(runtime: Runtime) {
  const cpfCnpj = onlyDigits(runtime.emitter.cnpj);
  const params = new URLSearchParams({
    cpf_cnpj: cpfCnpj,
    ambiente: ambienteApi(runtime.ambiente),
    "$top": "5"
  });
  const list = await acbrRequest<AcbrListResponse<AcbrDistributionResponse>>(runtime, "GET", `/distribuicao/nfe?${params.toString()}`);
  const items = list.data ?? [];
  const lastNsu = items.reduce((max, item) => {
    const n = BigInt(item.ultimo_nsu == null ? "0" : String(item.ultimo_nsu));
    return n > max ? n : max;
  }, 0n);
  const latest = items[0] ?? null;
  return { lastNsu, latest };
}

export async function listNfeDistributionDocuments(scope: TenantScope): Promise<NfeDistributionSummary[]> {
  const docs = await prisma.distribuicaoNfeDocumento.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
    orderBy: [{ dataEmissao: "desc" }, { criadoEm: "desc" }],
    take: 300
  });
  const byKey = new Map<string, typeof docs[number]>();
  for (const doc of docs) {
    const key = doc.chaveAcesso || doc.acbrDocumentoId;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, doc);
      continue;
    }
    const score = (item: typeof doc) =>
      (item.entradaFiscalId ? 100 : 0) +
      (item.resumo === false ? 20 : 0) +
      (item.status !== "ERRO" ? 5 : 0) +
      (item.emitenteNome ? 2 : 0) +
      (item.valorNfe ? 1 : 0);
    if (score(doc) > score(current)) byKey.set(key, doc);
  }

  return Array.from(byKey.values()).map((doc) => ({
    id: doc.id,
    acbrDocumentoId: doc.acbrDocumentoId,
    chaveAcesso: doc.chaveAcesso ?? "",
    numero: accessKeyNumber(doc.chaveAcesso),
    serie: accessKeySeries(doc.chaveAcesso),
    nsu: doc.nsu ?? "",
    emitenteNome: doc.emitenteNome ?? "Emitente não informado",
    emitenteDocumento: doc.emitenteDocumento ?? "",
    valor: Number(doc.valorNfe ?? 0),
    dataEmissao: doc.dataEmissao?.toISOString() ?? null,
    status: doc.status,
    statusLabel: statusLabel(doc.status, doc.entradaFiscalId, doc.manifestacaoStatus),
    statusTone: statusTone(doc.status, doc.entradaFiscalId),
    manifestacaoStatus: doc.manifestacaoStatus,
    resumo: doc.resumo,
    entradaFiscalId: doc.entradaFiscalId,
    ultimoErro: doc.ultimoErro,
    canDownloadXml: Boolean(doc.acbrDocumentoId),
    canDownloadPdf: Boolean(doc.acbrDocumentoId)
  }));
}

export async function refreshNfeDistributionDocuments(scope: TenantScope) {
  const runtime = await requireAcbrRuntime(scope);
  const listed = await syncListedDocuments(scope, runtime);

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "DistribuicaoNfeDocumento",
      entidadeId: scope.empresaId,
      acao: "DISTRIBUICAO_NFE_REFRESH",
      payload: { documentosListados: listed, modo: "listar-documentos-acbr" }
    });
  });

  return { listed };
}

export async function syncNfeDistribution(scope: TenantScope, options?: { ignoreWait?: boolean; fromStart?: boolean }) {
  const runtime = await requireAcbrRuntime(scope);
  const cpfCnpj = onlyDigits(runtime.emitter.cnpj);
  const docs = await prisma.distribuicaoNfeDocumento.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, nsu: { not: null } },
    select: { nsu: true }
  });
  let lastNsu = options?.fromStart ? 0n : docs.reduce((max, doc) => {
    const n = BigInt(doc.nsu ?? "0");
    return n > max ? n : max;
  }, 0n);
  const remoteState = await getRemoteDistributionState(runtime).catch(() => ({ lastNsu: 0n, latest: null }));
  if (!options?.fromStart && remoteState.lastNsu > lastNsu) lastNsu = remoteState.lastNsu;
  const latestCreatedAt = remoteState.latest?.created_at ? new Date(remoteState.latest.created_at) : null;
  const latestIsRecent = latestCreatedAt ? Date.now() - latestCreatedAt.getTime() < 60 * 60 * 1000 : false;
  const latestMotivo = remoteState.latest?.motivo_status ?? "";
  if (!options?.ignoreWait && latestIsRecent && /consumo indevido|tente apos 1 hora/i.test(latestMotivo)) {
    const listed = await syncListedDocuments(scope, runtime);
    return {
      distributionId: remoteState.latest?.id ?? null,
      status: remoteState.latest?.status ?? null,
      codigoStatus: remoteState.latest?.codigo_status ?? null,
      motivoStatus: latestMotivo,
      ultimoNsu: remoteState.latest?.ultimo_nsu == null ? null : String(remoteState.latest.ultimo_nsu),
      maxNsu: remoteState.latest?.max_nsu == null ? null : String(remoteState.latest.max_nsu),
      returned: 0,
      listed
    };
  }

  const body = {
    cpf_cnpj: cpfCnpj,
    ambiente: ambienteApi(runtime.ambiente),
    tipo_consulta: "dist-nsu",
    dist_nsu: Number(lastNsu),
    ignorar_tempo_espera: Boolean(options?.ignoreWait)
  };
  const distribution = await acbrRequest<AcbrDistributionResponse>(runtime, "POST", "/distribuicao/nfe", body);
  for (const doc of distribution.documentos ?? []) {
    await upsertDocument(scope, runtime, doc, distribution.id ?? null);
  }
  const listed = await syncListedDocuments(scope, runtime);

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "DistribuicaoNfeDocumento",
      entidadeId: distribution.id ?? scope.empresaId,
      acao: "DISTRIBUICAO_NFE_SYNC",
      payload: {
        status: distribution.status,
        codigoStatus: distribution.codigo_status ?? null,
        motivoStatus: distribution.motivo_status ?? null,
        ultimoNsu: distribution.ultimo_nsu == null ? null : String(distribution.ultimo_nsu),
        maxNsu: distribution.max_nsu == null ? null : String(distribution.max_nsu),
        documentosRetornados: distribution.documentos?.length ?? 0,
        documentosListados: listed,
        fromStart: Boolean(options?.fromStart)
      }
    });
  });

  return {
    distributionId: distribution.id ?? null,
    status: distribution.status ?? null,
    codigoStatus: distribution.codigo_status ?? null,
    motivoStatus: distribution.motivo_status ?? null,
    ultimoNsu: distribution.ultimo_nsu == null ? null : String(distribution.ultimo_nsu),
    maxNsu: distribution.max_nsu == null ? null : String(distribution.max_nsu),
    returned: distribution.documentos?.length ?? 0,
    listed
  };
}

export async function downloadDistributedNfeDocument(scope: TenantScope, localDocumentId: string, kind: "pdf" | "xml") {
  const runtime = await requireAcbrRuntime(scope);
  const doc = await prisma.distribuicaoNfeDocumento.findFirst({
    where: { id: localDocumentId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: { xmlImportacao: { select: { xmlOriginal: true } } }
  });
  if (!doc) throw new NfeDistributionError("Documento de distribuiÃ§Ã£o nÃ£o encontrado.");

  if (kind === "xml" && doc.xmlImportacao?.xmlOriginal) {
    const filename = `${doc.chaveAcesso || doc.acbrDocumentoId}.xml`;
    return { body: Buffer.from(doc.xmlImportacao.xmlOriginal, "utf8"), contentType: "application/xml", filename };
  }

  const downloaded = await acbrDownloadDocument(runtime, doc.acbrDocumentoId, kind);
  const ext = kind === "pdf" ? "pdf" : "xml";
  const filename = `${doc.chaveAcesso || doc.acbrDocumentoId}.${ext}`;
  return { ...downloaded, filename };
}

export async function importDistributedNfe(scope: TenantScope, localDocumentId: string) {
  const runtime = await requireAcbrRuntime(scope);
  const doc = await prisma.distribuicaoNfeDocumento.findFirst({
    where: { id: localDocumentId, tenantId: scope.tenantId, empresaId: scope.empresaId }
  });
  if (!doc) throw new NfeDistributionError("Documento de distribuição não encontrado.");
  if (!doc.chaveAcesso) throw new NfeDistributionError("Documento sem chave de acesso.");
  if (doc.entradaFiscalId) return { entradaFiscalId: doc.entradaFiscalId, alreadyImported: true };

  const existingEntry = await prisma.entradaFiscal.findFirst({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      chaveAcesso: doc.chaveAcesso
    },
    select: { id: true, xmlImportacaoId: true }
  });
  if (existingEntry) {
    await prisma.distribuicaoNfeDocumento.update({
      where: { id: doc.id },
      data: {
        status: "IMPORTADO",
        entradaFiscalId: existingEntry.id,
        xmlImportacaoId: existingEntry.xmlImportacaoId,
        ultimoErro: null
      }
    });
    return { entradaFiscalId: existingEntry.id, alreadyImported: true };
  }

  try {
    await prisma.distribuicaoNfeDocumento.update({
      where: { id: doc.id },
      data: { status: "IMPORTANDO", ultimoErro: null }
    });

    const manifest = await acbrRequest<AcbrManifestResponse>(runtime, "POST", "/distribuicao/nfe/manifestacoes", {
      cpf_cnpj: onlyDigits(runtime.emitter.cnpj),
      ambiente: ambienteApi(runtime.ambiente),
      chave_acesso: doc.chaveAcesso,
      tipo_evento: "210210"
    });

    await prisma.distribuicaoNfeDocumento.update({
      where: { id: doc.id },
      data: {
        manifestacaoId: manifest.id ?? null,
        manifestacaoStatus: manifest.status ?? "pendente",
        manifestacaoEvento: manifest.tipo_evento ?? "210210",
        manifestadoEm: manifest.data_evento ? dateOrNull(manifest.data_evento) : new Date()
      }
    });

    let xml: string;
    try {
      xml = await acbrDownloadXml(runtime, doc.acbrDocumentoId);
    } catch {
      await acbrRequest(runtime, "POST", "/distribuicao/nfe", {
        cpf_cnpj: onlyDigits(runtime.emitter.cnpj),
        ambiente: ambienteApi(runtime.ambiente),
        tipo_consulta: "cons-chave",
        cons_chave: doc.chaveAcesso,
        ignorar_tempo_espera: false
      });
      await syncListedDocuments(scope, runtime);
      xml = await acbrDownloadXml(runtime, doc.acbrDocumentoId);
    }

    const imported = await importNfeXml(scope, xml);
    const entrada = await prisma.entradaFiscal.findFirst({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, id: imported.id },
      select: { id: true, xmlImportacaoId: true }
    });

    await prisma.distribuicaoNfeDocumento.update({
      where: { id: doc.id },
      data: {
        status: "IMPORTADO",
        entradaFiscalId: imported.id,
        xmlImportacaoId: entrada?.xmlImportacaoId ?? null,
        resumo: false,
        ultimoErro: null
      }
    });

    return { entradaFiscalId: imported.id, alreadyImported: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível importar o XML distribuído.";
    await prisma.distribuicaoNfeDocumento.update({
      where: { id: doc.id },
      data: { status: "ERRO", ultimoErro: message }
    }).catch(() => undefined);
    throw error;
  }
}
