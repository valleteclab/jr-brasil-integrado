/**
 * Integração com a API de DADOS do Dataload (https://dataload.com.br/apidados): consulta de
 * nome/NCM/CEST de produto por GTIN. É a fonte PRIMÁRIA de dados por código de barras — do próprio
 * servidor do cliente e SEM cota diária (ao contrário do Cosmos, que limita 25/dia).
 *
 * API: GET {base}?ean=<GTIN> → { sucesso, encontrado, dados: { ean, nome, ncm, cest } }
 */
import type { TenantScope } from "@/lib/auth/dev-session";
import { consultarGtinCosmos } from "./cosmos-service";

/** Bytes dos caracteres específicos do Windows-1252 (faixa 0x80–0x9F) para reverter mojibake. */
const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88,
  "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93,
  "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f
};

/**
 * Corrige acentuação dupla-codificada (banco latin1/cp1252 servido como UTF-8): "NÃ‰CTAR" → "NÉCTAR".
 * Só age quando detecta o padrão (Ã/Â); devolve o texto original se a conversão não melhorar.
 */
export function corrigirAcentoDataload(s: string): string {
  if (!s || !/[ÃÂ]/.test(s)) return s;
  const bytes: number[] = [];
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0xff) bytes.push(code);
    else if (CP1252[ch] !== undefined) bytes.push(CP1252[ch]);
    else return s; // caractere fora do esperado → não é mojibake conhecido
  }
  try {
    const out = Buffer.from(bytes).toString("utf8");
    return out.includes("�") ? s : out;
  } catch {
    return s;
  }
}

function dataloadDadosBase(): string {
  return (process.env.DATALOAD_DADOS_URL || "https://dataload.com.br/apidados/api_dados.php").replace(/\/+$/, "");
}

function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export type DataloadDados = {
  encontrado: boolean;
  ean: string;
  nome: string | null;
  ncm: string | null;
  cest: string | null;
};

/** Consulta nome/NCM/CEST de um produto pelo GTIN na API de dados do Dataload. */
export async function consultarDadosDataload(gtin: string): Promise<DataloadDados> {
  const ean = onlyDigits(gtin);
  if (ean.length < 8) throw new Error("Código de barras (GTIN/EAN) inválido.");

  const res = await fetch(`${dataloadDadosBase()}?ean=${ean}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Dataload retornou erro ${res.status}.`);
  const data = (await res.json().catch(() => ({}))) as {
    encontrado?: boolean;
    dados?: { ean?: string; nome?: string; ncm?: number | string; cest?: string | null };
  };

  if (!data.encontrado || !data.dados) return { encontrado: false, ean, nome: null, ncm: null, cest: null };

  const ncm = onlyDigits(data.dados.ncm);
  const cest = onlyDigits(data.dados.cest);
  return {
    encontrado: true,
    ean: data.dados.ean ?? ean,
    nome: data.dados.nome ? corrigirAcentoDataload(data.dados.nome.trim()) : null,
    // NCM como número perde zero à esquerda — padroniza para 8 dígitos quando possível.
    ncm: ncm ? ncm.padStart(8, "0").slice(-8) : null,
    cest: cest || null
  };
}

/** Resultado unificado de consulta por GTIN (formato compatível com o do Cosmos). */
export type GtinLookup = {
  gtin: string;
  descricao: string;
  ncm: string | null;
  cest: string | null;
  marca: string | null;
  thumbnail: string | null;
  fonte: "DATALOAD" | "COSMOS";
};

/**
 * Consulta um produto por GTIN: tenta o Dataload PRIMEIRO (sem cota); só recorre ao Cosmos
 * (que tem cota diária) quando o Dataload não encontra. Lança erro se nenhum dos dois achar.
 */
export async function lookupProdutoGtin(scope: TenantScope, gtin: string): Promise<GtinLookup> {
  const dl = await consultarDadosDataload(gtin).catch(() => null);
  if (dl?.encontrado) {
    return { gtin: dl.ean, descricao: dl.nome ?? "", ncm: dl.ncm, cest: dl.cest, marca: null, thumbnail: null, fonte: "DATALOAD" };
  }
  // Fallback Cosmos (consome cota; pode lançar "não encontrado"/"não configurado").
  const cosmos = await consultarGtinCosmos(scope, gtin);
  return { ...cosmos, fonte: "COSMOS" };
}
