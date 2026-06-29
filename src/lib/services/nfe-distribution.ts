import type { AmbienteFiscal, DistribuicaoNfeDocumento, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { getFiscalRuntimeConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { importNfeXml } from "@/domains/products/application/fiscal-entry-use-cases";
import {
  consultarDistribuicaoDFe,
  consultarDistribuicaoPorChave,
  type DistDoc,
  type DistResult
} from "@/domains/fiscal/providers/sefaz/distribuicao";
import { enviarManifestacao } from "@/domains/fiscal/providers/sefaz/eventos";
import { cUFFromUF } from "@/domains/fiscal/providers/sefaz/endpoints";
import { pfxToPem } from "@/domains/fiscal/providers/sefaz/sign";
import { gerarDanfePdf } from "@/domains/fiscal/providers/sefaz/danfe-pdf";

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

/** Valida o runtime ACBr (gate puro). Lança NfeDistributionError com mensagens orientadas. */
function assertAcbrRuntime(runtime: Runtime): Runtime {
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

/** Gate ACBr por escopo (mantido para o caminho ACBr existente). */
async function requireAcbrRuntime(scope: TenantScope): Promise<Runtime> {
  const runtime = await getFiscalRuntimeConfig(scope);
  if (runtime.provider !== "ACBR") {
    throw new NfeDistributionError("A distribuição NF-e está disponível apenas para o provedor ACBr.");
  }
  return assertAcbrRuntime(runtime);
}

/** Runtime genérico: roteia o gate por provedor (ACBr × SEFAZ). */
async function getProviderRuntime(scope: TenantScope): Promise<Runtime> {
  const runtime = await getFiscalRuntimeConfig(scope);
  if (runtime.provider === "ACBR") return requireAcbrRuntime(scope);
  if (runtime.provider === "SEFAZ") return assertSefazRuntime(runtime);
  throw new NfeDistributionError("A distribuição NF-e está disponível apenas para os provedores ACBr e SEFAZ.");
}

/** Valida o runtime SEFAZ direto (gate puro): ativo + certificado A1 + CNPJ + UF. */
function assertSefazRuntime(runtime: Runtime): Runtime {
  if (!runtime.active) {
    throw new NfeDistributionError("Ative a configuração fiscal da SEFAZ antes de buscar NF-e recebidas.");
  }
  if (!runtime.certificado?.pfx) {
    throw new NfeDistributionError("Configure o certificado digital A1 da empresa antes de buscar NF-e recebidas na SEFAZ.");
  }
  if (!runtime.emitter.cnpj) {
    throw new NfeDistributionError("Informe o CNPJ da empresa antes de buscar NF-e recebidas.");
  }
  if (!runtime.emitter.uf) {
    throw new NfeDistributionError("Informe a UF da empresa antes de buscar NF-e recebidas na SEFAZ.");
  }
  return runtime;
}

/** Certificado A1 da empresa (pfx + senha) garantido para o caminho SEFAZ. */
function sefazCert(runtime: Runtime): { pfx: Buffer; senha: string } {
  if (!runtime.certificado?.pfx) {
    throw new NfeDistributionError("Certificado digital A1 indisponível para a operação na SEFAZ.");
  }
  return { pfx: runtime.certificado.pfx, senha: runtime.certificado.senha };
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

/**
 * Persiste um DistDoc da distribuição DIRETA na SEFAZ reusando as colunas do modelo (sem migration):
 * acbrDocumentoId = doc.nsu (id opaco único por empresa). XML completo vai para o `payload`.
 */
async function upsertSefazDocument(scope: TenantScope, runtime: Runtime, doc: DistDoc) {
  if (!doc.nsu) return null;
  const isResumo = doc.tipo === "resumoNFe";
  const isEvento = doc.tipo === "resumoEvento" || doc.tipo === "eventoCompleto";
  const hasFullXml = doc.tipo === "nfeCompleta";
  // Guarda o XML completo no payload (para o import usar sem novo round-trip); resumos mantêm o
  // raw para diagnóstico. Eventos guardam o XML para futura referência.
  const payload = { xml: doc.xml, schema: doc.schema, nsu: doc.nsu, tipo: doc.tipo } as unknown as Prisma.InputJsonValue;
  const valorNfe = doc.valorNfe == null ? null : doc.valorNfe;
  const dataEmissao = dateOrNull(doc.dataEmissao);

  return prisma.distribuicaoNfeDocumento.upsert({
    where: {
      tenantId_empresaId_acbrDocumentoId: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        acbrDocumentoId: doc.nsu
      }
    },
    update: {
      nsu: doc.nsu,
      schema: doc.schema ?? undefined,
      tipoDocumento: doc.schema ?? undefined,
      chaveAcesso: doc.chaveAcesso ?? undefined,
      resumo: isResumo,
      tipoEvento: doc.tipoEvento ?? undefined,
      numeroProtocolo: doc.numeroProtocolo ?? undefined,
      tipoNfe: doc.tipoNfe ?? undefined,
      valorNfe: valorNfe ?? undefined,
      dataEmissao: dataEmissao ?? undefined,
      emitenteDocumento: doc.emitenteDocumento ?? undefined,
      emitenteNome: doc.emitenteNome ?? undefined,
      payload,
      ultimoErro: null
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      acbrDocumentoId: doc.nsu,
      acbrDistribuicaoId: null,
      ambiente: runtime.ambiente,
      nsu: doc.nsu,
      schema: doc.schema ?? null,
      tipoDocumento: doc.schema ?? null,
      chaveAcesso: doc.chaveAcesso ?? null,
      resumo: isResumo,
      tipoEvento: doc.tipoEvento ?? null,
      numeroProtocolo: doc.numeroProtocolo ?? null,
      tipoNfe: doc.tipoNfe ?? null,
      valorNfe,
      dataEmissao,
      dataRecebimento: new Date(),
      emitenteDocumento: doc.emitenteDocumento ?? null,
      emitenteNome: doc.emitenteNome ?? null,
      payload,
      // EVENTO (manifestações/cancelamentos de terceiros), RECEBIDO (NF-e completa pronta p/ importar),
      // LISTADO (apenas resumo — exige ciência antes do XML completo).
      status: isEvento ? "EVENTO" : hasFullXml ? "RECEBIDO" : "LISTADO"
    }
  });
}

/**
 * LOOP de consulta da distribuição DIRETA na SEFAZ (NFeDistribuicaoDFe). Parte do maior NSU já
 * salvo e repete enquanto cStat===138 (documentos localizados) e ultNSU < maxNSU, limitado a
 * MAX_ITERATIONS por chamada. Para imediatamente em cStat===656 (consumo indevido).
 */
async function syncSefazDistribution(scope: TenantScope, runtime: Runtime, options?: { fromStart?: boolean }) {
  const MAX_ITERATIONS = 50;
  const cnpj = onlyDigits(runtime.emitter.cnpj);
  const cUFAutor = cUFFromUF(runtime.emitter.uf ?? "");
  const cert = sefazCert(runtime);

  // Marca a última sincronização (mesmo se a SEFAZ devolver 656 / nada novo): a UI mostra "atualizado em".
  await prisma.configuracaoFiscal.update({
    where: { empresaId: scope.empresaId },
    data: { distribuicaoSyncEm: new Date() }
  }).catch(() => undefined);

  const docs = await prisma.distribuicaoNfeDocumento.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, nsu: { not: null } },
    select: { nsu: true }
  });
  let ultNSU = options?.fromStart
    ? 0n
    : docs.reduce((max, doc) => {
        const n = BigInt(doc.nsu ?? "0");
        return n > max ? n : max;
      }, 0n);

  let returned = 0;
  let consumoIndevido = false;
  let last: DistResult | null = null;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;
    const result = await consultarDistribuicaoDFe({
      cnpj,
      cUFAutor,
      ambiente: runtime.ambiente,
      ultNSU: ultNSU.toString(),
      cert
    });
    last = result;

    // 656 = consumo indevido: a SEFAZ exige aguardar ~1h antes de nova consulta. Para e reporta.
    if (result.cStat === "656") {
      consumoIndevido = true;
      break;
    }

    for (const doc of result.docs) {
      await upsertSefazDocument(scope, runtime, doc);
      returned += 1;
    }

    const novoUltNSU = BigInt(result.ultNSU || "0");
    if (novoUltNSU > ultNSU) ultNSU = novoUltNSU;
    const maxNSU = BigInt(result.maxNSU || "0");

    // 138 = documentos localizados; continua enquanto ainda há lotes (ultNSU < maxNSU).
    if (result.cStat !== "138" || ultNSU >= maxNSU) break;
  }

  await prisma.$transaction(async (tx) => {
    await createAuditLog(tx, {
      scope,
      entidade: "DistribuicaoNfeDocumento",
      entidadeId: scope.empresaId,
      acao: "DISTRIBUICAO_NFE_SYNC",
      payload: {
        provider: "SEFAZ",
        status: last?.cStat ?? null,
        codigoStatus: last?.cStat ?? null,
        motivoStatus: last?.xMotivo ?? null,
        ultimoNsu: last?.ultNSU ?? ultNSU.toString(),
        maxNsu: last?.maxNSU ?? null,
        documentosRetornados: returned,
        iteracoes: iterations,
        consumoIndevido,
        fromStart: Boolean(options?.fromStart)
      }
    });
  });

  return {
    distributionId: null as string | null,
    status: last?.cStat ?? null,
    codigoStatus: last?.cStat ?? null,
    motivoStatus: consumoIndevido
      ? `${last?.cStat ?? "656"} ${last?.xMotivo ?? "Consumo indevido — aguarde 1 hora antes de nova consulta."}`.trim()
      : last?.xMotivo ?? null,
    ultimoNsu: last?.ultNSU ?? ultNSU.toString(),
    maxNsu: last?.maxNSU ?? null,
    returned,
    listed: returned,
    consumoIndevido
  };
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

/** Há XML completo disponível para este documento? (payload.xml da SEFAZ ou XML já importado). */
function hasFullXmlAvailable(doc: { payload: Prisma.JsonValue | null; xmlImportacaoId: string | null }): boolean {
  if (doc.xmlImportacaoId) return true;
  const payload = doc.payload as { xml?: unknown } | null;
  const xml = typeof payload?.xml === "string" ? payload.xml : "";
  return xml.includes("<NFe") || xml.includes("<nfeProc");
}

export async function listNfeDistributionDocuments(scope: TenantScope): Promise<NfeDistributionSummary[]> {
  const runtime = await getFiscalRuntimeConfig(scope).catch(() => null);
  const isSefaz = runtime?.provider === "SEFAZ";
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
    // ACBr serve XML/PDF pela API do documento; SEFAZ direto só quando há XML completo
    // (payload.xml após import/ciência, ou XML já importado).
    canDownloadXml: isSefaz ? hasFullXmlAvailable(doc) : Boolean(doc.acbrDocumentoId),
    canDownloadPdf: isSefaz ? hasFullXmlAvailable(doc) : Boolean(doc.acbrDocumentoId)
  }));
}

export async function refreshNfeDistributionDocuments(scope: TenantScope) {
  const runtime = await getProviderRuntime(scope);

  // SEFAZ direto não tem "listar documentos" remoto como a ACBr: o refresh é o próprio sync.
  if (runtime.provider === "SEFAZ") {
    const result = await syncSefazDistribution(scope, runtime);
    return { listed: result.returned };
  }

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
  const runtime = await getProviderRuntime(scope);

  if (runtime.provider === "SEFAZ") {
    return syncSefazDistribution(scope, runtime, { fromStart: options?.fromStart });
  }

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
  const runtime = await getProviderRuntime(scope);
  const doc = await prisma.distribuicaoNfeDocumento.findFirst({
    where: { id: localDocumentId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: { xmlImportacao: { select: { xmlOriginal: true } } }
  });
  if (!doc) throw new NfeDistributionError("Documento de distribuiÃ§Ã£o nÃ£o encontrado.");

  if (kind === "xml" && doc.xmlImportacao?.xmlOriginal) {
    const filename = `${doc.chaveAcesso || doc.acbrDocumentoId}.xml`;
    return { body: Buffer.from(doc.xmlImportacao.xmlOriginal, "utf8"), contentType: "application/xml", filename };
  }

  // SEFAZ direto: serve do XML salvo (payload/xmlImportacao). PDF é gerado localmente (buildDanfe).
  if (runtime.provider === "SEFAZ") {
    const payload = doc.payload as { xml?: unknown } | null;
    const payloadXml = typeof payload?.xml === "string" ? payload.xml : "";
    const xml = doc.xmlImportacao?.xmlOriginal || payloadXml;
    const hasFull = xml.includes("<NFe") || xml.includes("<nfeProc");
    if (!hasFull) {
      throw new NfeDistributionError(
        "Apenas o resumo desta NF-e está disponível. Importe (dê ciência) o documento antes de baixar o XML/PDF."
      );
    }
    if (kind === "xml") {
      const filename = `${doc.chaveAcesso || doc.acbrDocumentoId}.xml`;
      return { body: Buffer.from(xml, "utf8"), contentType: "application/xml", filename };
    }
    const pdf = await gerarDanfePdf(xml);
    return {
      body: pdf,
      contentType: "application/pdf",
      filename: `${doc.chaveAcesso || doc.acbrDocumentoId}.pdf`
    };
  }

  const downloaded = await acbrDownloadDocument(runtime, doc.acbrDocumentoId, kind);
  const ext = kind === "pdf" ? "pdf" : "xml";
  const filename = `${doc.chaveAcesso || doc.acbrDocumentoId}.${ext}`;
  return { ...downloaded, filename };
}

export async function importDistributedNfe(scope: TenantScope, localDocumentId: string) {
  const runtime = await getProviderRuntime(scope);
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

  if (runtime.provider === "SEFAZ") {
    return importDistributedNfeSefaz(scope, runtime, doc);
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

/**
 * Import do caminho SEFAZ direto. Se já há XML completo salvo (payload.xml), importa direto. Se só
 * há resumo, faz a Ciência (210210) via enviarManifestacao, baixa o procNFe completo com
 * consultarDistribuicaoPorChave, importa e atualiza o documento. Espelha o estado/erro do ACBr.
 */
async function importDistributedNfeSefaz(
  scope: TenantScope,
  runtime: Runtime,
  doc: DistribuicaoNfeDocumento
) {
  const chave = doc.chaveAcesso as string;
  const cnpj = onlyDigits(runtime.emitter.cnpj);
  const cUFAutor = cUFFromUF(runtime.emitter.uf ?? "");
  const cert = sefazCert(runtime);

  try {
    await prisma.distribuicaoNfeDocumento.update({
      where: { id: doc.id },
      data: { status: "IMPORTANDO", ultimoErro: null }
    });

    // 1) XML completo já salvo no payload? (doc.tipo === "nfeCompleta" na distribuição).
    const payload = doc.payload as { xml?: unknown } | null;
    const payloadXml = typeof payload?.xml === "string" ? payload.xml : "";
    let xml = payloadXml.includes("<NFe") || payloadXml.includes("<nfeProc") ? payloadXml : "";
    let manifestacao: { status: string; protocolo?: string; motivo?: string; cStat?: string } | null = null;

    // 2) Só resumo: dá Ciência (210210) e baixa o procNFe completo por chave.
    if (!xml) {
      const pem = pfxToPem(cert.pfx, cert.senha);
      const result = await enviarManifestacao({
        ambiente: runtime.ambiente,
        cnpj,
        chNFe: chave,
        tipoEvento: "210210",
        cert,
        pem
      });
      manifestacao = result;

      await prisma.distribuicaoNfeDocumento.update({
        where: { id: doc.id },
        data: {
          manifestacaoId: result.protocolo ?? null,
          manifestacaoStatus: result.status,
          manifestacaoEvento: "210210",
          manifestadoEm: new Date()
        }
      });

      if (result.status === "ERRO") {
        throw new NfeDistributionError(result.motivo || "Falha ao enviar a ciência (210210) à SEFAZ.");
      }

      const byChave = await consultarDistribuicaoPorChave({
        cnpj,
        cUFAutor,
        chNFe: chave,
        ambiente: runtime.ambiente,
        cert
      });
      // Persiste todos os docs retornados (atualiza o próprio NSU com o XML completo, quando vier).
      for (const d of byChave.docs) {
        await upsertSefazDocument(scope, runtime, d);
      }
      const full = byChave.docs.find(
        (d) => d.tipo === "nfeCompleta" && (!d.chaveAcesso || onlyDigits(d.chaveAcesso) === onlyDigits(chave))
      );
      xml = full?.xml && (full.xml.includes("<NFe") || full.xml.includes("<nfeProc")) ? full.xml : "";
      if (!xml) {
        throw new NfeDistributionError(
          `Ciência enviada, mas a NF-e completa ainda não foi disponibilizada pela SEFAZ (${byChave.cStat} ${byChave.xMotivo}). Tente novamente em instantes.`
        );
      }
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
        ...(manifestacao
          ? {
              manifestacaoStatus: manifestacao.status,
              manifestacaoEvento: "210210"
            }
          : {}),
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

/**
 * Sincronização AUTOMÁTICA da distribuição (substitui serviços externos tipo Qive). Para CADA empresa
 * ativa com provedor SEFAZ + A1: roda o sync (baixa resumos por NSU) e, para os resumos pendentes,
 * envia a Ciência (210210) e baixa o XML completo (procNFe) por chave — SEM criar entrada fiscal (o
 * usuário decide o que importar). Idempotente e multi-tenant. Para rodar a cada ~1h (cron): respeita
 * o throttling do AN (656 só afeta o sync; a ciência por chave segue). mesesHistorico limita o quão
 * para trás dá ciência (default 6); maxCienciaPorEmpresa evita rajada por execução.
 */
export async function runDistribuicaoCron(opts?: {
  mesesHistorico?: number;
  maxCienciaPorEmpresa?: number;
}): Promise<{ empresas: number; resultados: Array<{ empresaId: string; sync: string; ciencias: number; erro?: string }> }> {
  const meses = opts?.mesesHistorico ?? 6;
  const maxCiencia = opts?.maxCienciaPorEmpresa ?? 25;
  const desde = new Date(Date.now() - meses * 30 * 24 * 60 * 60 * 1000);
  const configs = await prisma.configuracaoFiscal.findMany({ where: { ativo: true }, select: { tenantId: true, empresaId: true } });
  const resultados: Array<{ empresaId: string; sync: string; ciencias: number; erro?: string }> = [];

  for (const cfg of configs) {
    const scope = { tenantId: cfg.tenantId, empresaId: cfg.empresaId } as TenantScope;
    const item: { empresaId: string; sync: string; ciencias: number; erro?: string } = { empresaId: cfg.empresaId, sync: "", ciencias: 0 };
    try {
      const runtime = await getProviderRuntime(scope);
      if (runtime.provider !== "SEFAZ") {
        item.sync = "ignorada (provedor nao-SEFAZ)";
        resultados.push(item);
        continue;
      }
      const sync = await syncSefazDistribution(scope, runtime).catch((e) => ({ cStat: "ERRO", xMotivo: e instanceof Error ? e.message : String(e), returned: 0 }));
      item.sync = `${(sync as { cStat?: string }).cStat ?? ""} ${(sync as { xMotivo?: string }).xMotivo ?? ""}`.trim();

      // Resumos sem o XML completo ainda (status LISTADO). NÃO filtra por manifestadoEm: a ciência é
      // dada uma vez, mas a consulta por chave é RE-TENTADA até a SEFAZ disponibilizar o XML (a
      // nfeCompleta não vem na mesma hora da ciência).
      const pendentes = await prisma.distribuicaoNfeDocumento.findMany({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          status: "LISTADO",
          chaveAcesso: { not: null },
          OR: [{ dataEmissao: { gte: desde } }, { dataEmissao: null }]
        },
        orderBy: { dataEmissao: "desc" },
        take: maxCiencia
      });
      if (pendentes.length) {
        const cnpj = onlyDigits(runtime.emitter.cnpj);
        const cUFAutor = cUFFromUF(runtime.emitter.uf ?? "");
        const cert = sefazCert(runtime);
        const pem = pfxToPem(cert.pfx, cert.senha);
        for (const doc of pendentes) {
          const chave = onlyDigits(doc.chaveAcesso as string);
          try {
            // Ciência (210210) só na primeira vez (quando ainda não foi enviada).
            if (!doc.manifestacaoEvento) {
              await enviarManifestacao({ ambiente: runtime.ambiente, cnpj, chNFe: chave, tipoEvento: "210210", cert, pem });
              await prisma.distribuicaoNfeDocumento.update({
                where: { id: doc.id },
                data: { manifestacaoEvento: "210210", manifestadoEm: new Date() }
              }).catch(() => undefined);
            }
            // Tenta baixar o XML completo; quando vier, atualiza o PRÓPRIO resumo (sem duplicar).
            const byChave = await consultarDistribuicaoPorChave({ cnpj, cUFAutor, chNFe: chave, ambiente: runtime.ambiente, cert });
            const full = byChave.docs.find((d) => d.tipo === "nfeCompleta" && (d.xml.includes("<NFe") || d.xml.includes("<nfeProc")));
            if (full) {
              const payloadAtual = (doc.payload as Record<string, unknown> | null) ?? {};
              await prisma.distribuicaoNfeDocumento.update({
                where: { id: doc.id },
                data: { status: "RECEBIDO", resumo: false, payload: { ...payloadAtual, xml: full.xml, tipo: "nfeCompleta" } as Prisma.InputJsonValue }
              }).catch(() => undefined);
              item.ciencias++;
            }
          } catch {
            // segue para a proxima nota
          }
        }
      }
    } catch (e) {
      item.erro = e instanceof Error ? e.message : String(e);
    }
    resultados.push(item);
  }

  return { empresas: configs.length, resultados };
}
