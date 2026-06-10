/**
 * Integração com o catálogo Cosmos (Bluesoft): consulta de produto por código de barras (GTIN/EAN)
 * para enriquecer o cadastro com descrição, NCM, CEST e marca. O token de acesso é guardado
 * criptografado por empresa (ConfiguracaoIntegracao, provedor "COSMOS"), no mesmo padrão da IA.
 */
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { encryptSecret, decryptSecret, secretLastChars } from "@/lib/security/secret-crypto";

const PROVEDOR = "COSMOS";
const COSMOS_BASE_URL = "https://api.cosmos.bluesoft.com.br";

export class CosmosError extends Error {}

export type CosmosConfigSummary = {
  configurado: boolean;
  ativo: boolean;
  chaveFinal: string | null;
  ultimoErro: string | null;
};

export type GtinLookupResult = {
  gtin: string;
  descricao: string;
  ncm: string | null;
  cest: string | null;
  marca: string | null;
  thumbnail: string | null;
};

function onlyDigits(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).replace(/\D/g, "") : "";
}

// ─── Configuração ──────────────────────────────────────────────────────────────

export async function getCosmosConfig(scope: TenantScope): Promise<CosmosConfigSummary> {
  const config = await prisma.configuracaoIntegracao.findUnique({
    where: { tenantId_empresaId_provedor: { tenantId: scope.tenantId, empresaId: scope.empresaId, provedor: PROVEDOR } }
  });
  return {
    configurado: Boolean(config),
    ativo: config?.ativo ?? false,
    chaveFinal: config?.chaveFinal ?? null,
    ultimoErro: config?.ultimoErro ?? null
  };
}

export type SaveCosmosConfigInput = { token?: string; ativo?: boolean; observacoes?: string | null };

export async function saveCosmosConfig(scope: TenantScope, input: SaveCosmosConfigInput): Promise<CosmosConfigSummary> {
  const token = input.token?.trim();
  const existing = await prisma.configuracaoIntegracao.findUnique({
    where: { tenantId_empresaId_provedor: { tenantId: scope.tenantId, empresaId: scope.empresaId, provedor: PROVEDOR } }
  });

  if (!existing && !token) {
    throw new CosmosError("Informe o token do Cosmos para ativar a integração.");
  }

  const secretData = token ? { chaveCriptografada: encryptSecret(token), chaveFinal: secretLastChars(token) } : {};

  const config = await prisma.configuracaoIntegracao.upsert({
    where: { tenantId_empresaId_provedor: { tenantId: scope.tenantId, empresaId: scope.empresaId, provedor: PROVEDOR } },
    update: { ativo: input.ativo ?? existing?.ativo ?? true, observacoes: input.observacoes?.trim() || null, ultimoErro: null, ...secretData },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      provedor: PROVEDOR,
      ativo: input.ativo ?? true,
      observacoes: input.observacoes?.trim() || null,
      chaveCriptografada: secretData.chaveCriptografada!,
      chaveFinal: secretData.chaveFinal!
    }
  });

  return { configurado: true, ativo: config.ativo, chaveFinal: config.chaveFinal, ultimoErro: config.ultimoErro };
}

// ─── Consulta por GTIN ───────────────────────────────────────────────────────────

async function getActiveToken(scope: TenantScope): Promise<string> {
  const config = await prisma.configuracaoIntegracao.findUnique({
    where: { tenantId_empresaId_provedor: { tenantId: scope.tenantId, empresaId: scope.empresaId, provedor: PROVEDOR } }
  });
  if (!config || !config.ativo) {
    throw new CosmosError("Integração com o Cosmos não configurada ou desativada para esta empresa.");
  }
  return decryptSecret(config.chaveCriptografada);
}

function extractCest(raw: unknown): string | null {
  // A API retorna cest como objeto { code } ou lista de objetos; pega o primeiro válido.
  if (!raw) return null;
  const item = Array.isArray(raw) ? raw[0] : raw;
  const code = onlyDigits((item as { code?: unknown })?.code);
  return code || null;
}

/** Cache de GTIN válido por 180 dias — dados de produto mudam pouco e a cota diária é escassa. */
const COSMOS_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/** Consulta um produto por GTIN no Cosmos e devolve os campos para preencher o cadastro. */
export async function consultarGtinCosmos(scope: TenantScope, gtinInput: string): Promise<GtinLookupResult> {
  const gtin = onlyDigits(gtinInput);
  if (gtin.length < 8) throw new CosmosError("Código de barras (GTIN/EAN) inválido.");

  // Cache primeiro: evita gastar a cota diária consultando o mesmo GTIN de novo.
  const cached = await prisma.cosmosCache.findUnique({ where: { gtin } });
  if (cached && Date.now() - cached.buscadoEm.getTime() < COSMOS_CACHE_TTL_MS) {
    return {
      gtin: cached.gtin,
      descricao: cached.descricao ?? "",
      ncm: cached.ncm,
      cest: cached.cest,
      marca: cached.marca,
      thumbnail: cached.thumbnail
    };
  }

  const token = await getActiveToken(scope);

  let response: Response;
  try {
    response = await fetch(`${COSMOS_BASE_URL}/gtins/${gtin}`, {
      headers: {
        "X-Cosmos-Token": token,
        "Content-Type": "application/json",
        // O Cosmos exige um User-Agent; requisições sem ele são bloqueadas (403).
        "User-Agent": "XERP/1.0"
      }
    });
  } catch {
    throw new CosmosError("Não foi possível conectar ao Cosmos. Verifique a conexão.");
  }

  if (response.status === 404) throw new CosmosError(`Produto não encontrado no Cosmos para o GTIN ${gtin}.`);
  if (response.status === 401 || response.status === 403) throw new CosmosError("Token do Cosmos inválido ou sem permissão.");
  if (response.status === 429) throw new CosmosError("Limite de consultas do Cosmos atingido. Tente novamente mais tarde.");
  if (!response.ok) throw new CosmosError(`Cosmos retornou erro ${response.status}.`);

  const data = await response.json() as {
    description?: string;
    gtin?: number | string;
    ncm?: { code?: string } | null;
    cest?: unknown;
    brand?: { name?: string } | null;
    thumbnail?: string | null;
  };

  const resultado: GtinLookupResult = {
    gtin: onlyDigits(data.gtin) || gtin,
    descricao: (data.description ?? "").trim(),
    ncm: onlyDigits(data.ncm?.code) || null,
    cest: extractCest(data.cest),
    marca: data.brand?.name?.trim() || null,
    thumbnail: data.thumbnail ?? null
  };

  // Grava no cache (chave = GTIN consultado) para próximas consultas não gastarem cota.
  await prisma.cosmosCache.upsert({
    where: { gtin },
    update: { descricao: resultado.descricao, ncm: resultado.ncm, cest: resultado.cest, marca: resultado.marca, thumbnail: resultado.thumbnail, buscadoEm: new Date() },
    create: { gtin, descricao: resultado.descricao, ncm: resultado.ncm, cest: resultado.cest, marca: resultado.marca, thumbnail: resultado.thumbnail }
  });

  return resultado;
}

type CosmosProduct = {
  description?: string;
  gtin?: number | string;
  ncm?: { code?: string } | null;
  cest?: unknown;
  brand?: { name?: string } | null;
  thumbnail?: string | null;
};

function normalizeProduct(p: CosmosProduct, fallbackGtin = ""): GtinLookupResult {
  return {
    gtin: onlyDigits(p.gtin) || fallbackGtin,
    descricao: (p.description ?? "").trim(),
    ncm: onlyDigits(p.ncm?.code) || null,
    cest: extractCest(p.cest),
    marca: p.brand?.name?.trim() || null,
    thumbnail: p.thumbnail ?? null
  };
}

/** Busca produtos no Cosmos por descrição (texto livre). Devolve os primeiros resultados. */
export async function buscarProdutosCosmos(scope: TenantScope, query: string, limite = 15): Promise<GtinLookupResult[]> {
  const termo = (query ?? "").trim();
  if (termo.length < 3) throw new CosmosError("Informe ao menos 3 caracteres para buscar.");

  const token = await getActiveToken(scope);

  let response: Response;
  try {
    response = await fetch(`${COSMOS_BASE_URL}/products?query=${encodeURIComponent(termo)}`, {
      headers: {
        "X-Cosmos-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "XERP/1.0"
      }
    });
  } catch {
    throw new CosmosError("Não foi possível conectar ao Cosmos. Verifique a conexão.");
  }

  if (response.status === 401 || response.status === 403) throw new CosmosError("Token do Cosmos inválido ou sem permissão.");
  if (response.status === 429) throw new CosmosError("Limite de consultas do Cosmos atingido. Tente novamente mais tarde.");
  if (!response.ok) throw new CosmosError(`Cosmos retornou erro ${response.status}.`);

  const data = await response.json() as { products?: CosmosProduct[] };
  const produtos = Array.isArray(data.products) ? data.products : [];
  return produtos.slice(0, limite).map((p) => normalizeProduct(p)).filter((p) => p.descricao);
}
