import https from "node:https";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import type { AmbienteFiscal, Prisma } from "@prisma/client";
import { carregarCertificado } from "@/domains/fiscal/application/certificado-use-cases";
import { getFiscalRuntimeConfig } from "@/domains/fiscal/application/fiscal-config-use-cases";
import { buildDanfse } from "@/domains/fiscal/providers/nacional/danfse";
import { pfxTlsOptions } from "@/domains/fiscal/providers/pfx-utils";

/**
 * Distribuição de NFS-e do Sistema Nacional (ADN — Ambiente de Dados Nacional).
 * GET https://adn.nfse.gov.br/contribuintes/DFe/{NSU} (mTLS com o A1) devolve, em lotes de até 50,
 * os DF-e do CNPJ — NFS-e EMITIDAS por ele (prestador) e RECEBIDAS como tomador — com o XML completo
 * (ArquivoXml em GZip+Base64). Sincroniza incrementalmente por NSU; respeita o throttling (HTTP 429,
 * ~1 lote por intervalo) parando a execução e retomando no ciclo seguinte. Substitui consulta manual
 * no portal nacional.
 */

const ADN: Record<AmbienteFiscal, string> = {
  PRODUCAO: "adn.nfse.gov.br",
  HOMOLOGACAO: "adn.producaorestrita.nfse.gov.br"
};

const MAX_LOTES_POR_EXECUCAO = 12; // ~600 docs por execução; o resto vem nos próximos ciclos

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const pickTag = (xml: string, tag: string): string | undefined =>
  new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1];

type AdnLote = {
  statusCode: number;
  status: string;
  docs: Array<{ nsu: number; chave: string | null; tipo: string | null; xml: string }>;
};

/** GET no ADN com mTLS (A1). Retorna o corpo bruto. */
function getAdn(host: string, path: string, cert: { pfx: Buffer; senha: string }): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: host, path, method: "GET", ...pfxTlsOptions(cert), timeout: 20000,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: d })); }
    );
    req.on("error", (e) => resolve({ statusCode: 0, body: String(e) }));
    req.on("timeout", () => { req.destroy(); resolve({ statusCode: -1, body: "timeout" }); });
    req.end();
  });
}

/** GET binário no ADN (para o DANFSE PDF). */
function getAdnBinary(host: string, path: string, cert: { pfx: Buffer; senha: string }): Promise<{ statusCode: number; contentType: string; body: Buffer }> {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: host, path, method: "GET", ...pfxTlsOptions(cert), timeout: 25000,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/pdf" } },
      (res) => { const ch: Buffer[] = []; res.on("data", (c) => ch.push(c)); res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(ch) })); }
    );
    req.on("error", () => resolve({ statusCode: 0, contentType: "", body: Buffer.alloc(0) }));
    req.on("timeout", () => { req.destroy(); resolve({ statusCode: -1, contentType: "", body: Buffer.alloc(0) }); });
    req.end();
  });
}

/** Consulta um lote do ADN a partir do último NSU sincronizado (0 = início). */
async function consultarDfeNfse(ultNSU: bigint, cert: { pfx: Buffer; senha: string }, ambiente: AmbienteFiscal): Promise<AdnLote> {
  const nsu = ultNSU.toString().padStart(15, "0");
  const res = await getAdn(ADN[ambiente], `/contribuintes/DFe/${nsu}`, cert);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    return { statusCode: res.statusCode, status: res.statusCode === 429 ? "THROTTLING" : "ERRO", docs: [] };
  }
  let j: { StatusProcessamento?: string; LoteDFe?: Array<{ NSU: number; ChaveAcesso?: string; TipoDocumento?: string; ArquivoXml?: string }> };
  try { j = JSON.parse(res.body); } catch { return { statusCode: res.statusCode, status: "ERRO", docs: [] }; }
  const docs = (j.LoteDFe ?? []).map((it) => ({
    nsu: it.NSU,
    chave: it.ChaveAcesso ?? null,
    tipo: it.TipoDocumento ?? null,
    xml: it.ArquivoXml ? gunzipSync(Buffer.from(it.ArquivoXml, "base64")).toString("utf8") : ""
  }));
  return { statusCode: res.statusCode, status: j.StatusProcessamento ?? "", docs };
}

/** Extrai os campos de exibição de uma NFS-e (do XML <NFSe>) e o papel do CNPJ informado. */
function parseNfse(xml: string, cnpjEmpresa: string) {
  const chave = (/<infNFSe[^>]*\bId="NFS(\d{50})"/.exec(xml)?.[1] ?? onlyDigits(pickTag(xml, "chNFSe"))) || null;
  const nNFSe = pickTag(xml, "nNFSe") ?? null;
  const emitBloco = /<emit>([\s\S]*?)<\/emit>/.exec(xml)?.[1] ?? "";
  const emitDoc = onlyDigits(pickTag(emitBloco, "CNPJ") ?? pickTag(emitBloco, "CPF"));
  const emitNome = pickTag(emitBloco, "xNome") ?? null;
  const tomaBloco = /<toma>([\s\S]*?)<\/toma>/.exec(xml)?.[1] ?? "";
  const tomaDoc = onlyDigits(pickTag(tomaBloco, "CNPJ") ?? pickTag(tomaBloco, "CPF"));
  const tomaNome = pickTag(tomaBloco, "xNome") ?? null;
  const valor = pickTag(xml, "vLiq") ?? pickTag(xml, "vServ") ?? pickTag(xml, "vServPrest");
  const dataStr = pickTag(xml, "dhProc") ?? pickTag(xml, "dhEmi");
  const papel = emitDoc === cnpjEmpresa ? "PRESTADOR" : tomaDoc === cnpjEmpresa ? "TOMADOR" : "OUTRO";
  return {
    chave,
    nNFSe,
    emitenteDocumento: emitDoc || null,
    emitenteNome: emitNome,
    tomadorDocumento: tomaDoc || null,
    tomadorNome: tomaNome,
    valor: valor ? Number(valor) : null,
    dataEmissao: dataStr ? new Date(dataStr) : null,
    papel
  };
}

export type NfseDistribuicaoResultado = {
  status: string;
  lotes: number;
  novos: number;
  prestador: number;
  tomador: number;
  ultimoNsu: string;
};

/**
 * Sincroniza a distribuição de NFS-e da empresa (provedor NACIONAL). Itera lotes do ADN a partir do
 * último NSU salvo, faz upsert dos documentos e atualiza o ponteiro. Idempotente; para no throttling.
 */
export async function syncNfseDistribution(scope: TenantScope, options?: { fromStart?: boolean }): Promise<NfseDistribuicaoResultado> {
  const runtime = await getFiscalRuntimeConfig(scope).catch(() => null);
  const cnpjEmpresa = onlyDigits(runtime?.emitter?.cnpj);
  const ambiente: AmbienteFiscal = runtime?.ambiente ?? "PRODUCAO";
  const cert = runtime?.certificado ?? (await carregarCertificado(scope).catch(() => null));
  if (!cert?.pfx) {
    return { status: "SEM_CERTIFICADO", lotes: 0, novos: 0, prestador: 0, tomador: 0, ultimoNsu: "0" };
  }

  const cfg = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: scope.empresaId }, select: { nfseDistNsu: true } });
  let ultNSU = options?.fromStart ? 0n : BigInt(cfg?.nfseDistNsu || "0");

  let lotes = 0, novos = 0, prestador = 0, tomador = 0, status = "";
  for (let i = 0; i < MAX_LOTES_POR_EXECUCAO; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500)); // espaça as chamadas (throttling do ADN)
    const lote = await consultarDfeNfse(ultNSU, cert, ambiente);
    status = lote.status;
    if (lote.status === "THROTTLING" || !lote.docs.length) break;
    lotes++;

    const dados = lote.docs.map((d) => {
      const isNfse = (d.tipo ?? "").toUpperCase() === "NFSE";
      const info = isNfse && d.xml ? parseNfse(d.xml, cnpjEmpresa) : null;
      if (info?.papel === "PRESTADOR") prestador++;
      else if (info?.papel === "TOMADOR") tomador++;
      return {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ambiente,
        nsu: String(d.nsu),
        chaveAcesso: d.chave ?? info?.chave ?? null,
        nNFSe: info?.nNFSe ?? null,
        tipoDocumento: d.tipo ?? null,
        papel: info?.papel ?? null,
        emitenteDocumento: info?.emitenteDocumento ?? null,
        emitenteNome: info?.emitenteNome ?? null,
        tomadorDocumento: info?.tomadorDocumento ?? null,
        tomadorNome: info?.tomadorNome ?? null,
        valor: info?.valor ?? null,
        dataEmissao: info?.dataEmissao ?? null,
        payload: { xml: d.xml } as Prisma.InputJsonValue
      };
    });
    // skipDuplicates: o NSU é único por empresa — protege contra reprocesso/sobreposição de lote.
    const ins = await prisma.distribuicaoNfseDocumento.createMany({ data: dados, skipDuplicates: true });
    novos += ins.count;

    ultNSU = BigInt(Math.max(...lote.docs.map((d) => d.nsu)));
    if (lote.status !== "DOCUMENTOS_LOCALIZADOS") break;
  }

  await prisma.configuracaoFiscal.update({
    where: { empresaId: scope.empresaId },
    data: { nfseDistNsu: ultNSU.toString(), nfseDistSyncEm: new Date() }
  }).catch(() => undefined);

  return { status, lotes, novos, prestador, tomador, ultimoNsu: ultNSU.toString() };
}

/** Lista os documentos de distribuição de NFS-e da empresa (mais recentes primeiro). */
export async function listNfseDistributionDocuments(scope: TenantScope, papel?: "PRESTADOR" | "TOMADOR") {
  const docs = await prisma.distribuicaoNfseDocumento.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, tipoDocumento: "NFSE", ...(papel ? { papel } : {}) },
    orderBy: [{ dataEmissao: "desc" }, { criadoEm: "desc" }],
    take: 300,
    select: {
      id: true, nsu: true, chaveAcesso: true, nNFSe: true, papel: true,
      emitenteNome: true, emitenteDocumento: true, tomadorNome: true, tomadorDocumento: true,
      valor: true, dataEmissao: true, status: true, notaFiscalId: true
    }
  });
  return docs.map((d) => ({
    ...d,
    valor: Number(d.valor ?? 0),
    dataEmissao: d.dataEmissao?.toISOString() ?? null
  }));
}

/**
 * Baixa o XML ou o DANFSE (PDF) de uma NFS-e da distribuição. O XML já está salvo no payload; o PDF
 * usa o DANFSE oficial do ADN (pela chave, mTLS) com fallback para o gerado a partir do XML local.
 */
export async function downloadNfseDistribuido(
  scope: TenantScope,
  docId: string,
  kind: "pdf" | "xml"
): Promise<{ contentType: string; body: Buffer; filename: string }> {
  const doc = await prisma.distribuicaoNfseDocumento.findFirst({
    where: { id: docId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    select: { chaveAcesso: true, nNFSe: true, ambiente: true, payload: true }
  });
  if (!doc) throw new Error("NFS-e não encontrada na distribuição.");
  const payloadXml = (doc.payload as { xml?: unknown } | null)?.xml;
  const xml = typeof payloadXml === "string" ? payloadXml : "";
  const nome = doc.nNFSe || onlyDigits(doc.chaveAcesso) || "nfse";

  if (kind === "xml") {
    if (!xml) throw new Error("XML da NFS-e não disponível.");
    return { contentType: "application/xml", body: Buffer.from(xml, "utf8"), filename: `NFSE-${nome}.xml` };
  }

  if (!doc.chaveAcesso) throw new Error("NFS-e sem chave de acesso para gerar o DANFSE.");
  const config = await getFiscalRuntimeConfig(scope).catch(() => null);
  const cert = config?.certificado ?? (await carregarCertificado(scope).catch(() => null));
  const chave = onlyDigits(doc.chaveAcesso);

  // 1) DANFSE PDF oficial do ADN (pela chave, mTLS) — 3x para 502/503/504 transitório.
  if (cert?.pfx) {
    for (let i = 0; i < 3; i++) {
      const pdf = await getAdnBinary(ADN[doc.ambiente], `/danfse/${chave}`, cert);
      if (pdf.statusCode >= 200 && pdf.statusCode < 300 && pdf.body.subarray(0, 4).toString("latin1") === "%PDF") {
        return { contentType: "application/pdf", body: pdf.body, filename: `NFSE-${nome}.pdf` };
      }
      if (![502, 503, 504].includes(pdf.statusCode)) break;
      if (i < 2) await new Promise((r) => setTimeout(r, 1200));
    }
  }

  // 2) Fallback: DANFSE gerado a partir do XML que já temos (HTML printable) — sempre disponível.
  if (xml) {
    const d = buildDanfse(xml, { logoDataUrl: config?.logotipoInfo ?? undefined });
    return { contentType: d.contentType, body: d.body, filename: d.filename || `NFSE-${nome}.html` };
  }
  throw new Error("Não foi possível gerar o DANFSE (sem PDF do ADN nem XML local).");
}
