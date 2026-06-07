import { prisma } from "@/lib/db/prisma";
import type { TipoCodigoFiscal } from "@/domains/fiscal/fiscal-codes-baseline";

export type CodigoFiscalOption = { codigo: string; descricao: string };

/** Lista os códigos fiscais de um tipo (CFOP, CST_ICMS, CSOSN, ORIGEM, CST_PIS/COFINS/IPI). */
export async function listCodigosFiscais(tipo: TipoCodigoFiscal): Promise<CodigoFiscalOption[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await prisma.codigoFiscal.findMany({
      where: { tipo },
      orderBy: { codigo: "asc" },
      select: { codigo: true, descricao: true }
    });
  } catch {
    return [];
  }
}

/** Carrega vários tipos de uma vez (para alimentar as telas fiscais). */
export async function listCodigosFiscaisMany(
  tipos: TipoCodigoFiscal[]
): Promise<Record<string, CodigoFiscalOption[]>> {
  const entradas = await Promise.all(tipos.map(async (t) => [t, await listCodigosFiscais(t)] as const));
  return Object.fromEntries(entradas);
}

export type CestOption = { codigo: string; descricao: string };

/**
 * CESTs candidatos para um produto. Prioriza os vinculados ao NCM informado (ancoragem); se não
 * houver NCM ou nenhum casar, cai numa busca por palavra-chave da descrição.
 */
export async function searchCest(ncm?: string | null, termo?: string | null, limite = 12): Promise<CestOption[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const ncmDigits = (ncm ?? "").replace(/\D/g, "");
    if (ncmDigits.length === 8) {
      const porNcm = await prisma.cest.findMany({
        where: { ncms: { has: ncmDigits } },
        orderBy: { codigo: "asc" },
        take: limite,
        select: { codigo: true, descricao: true }
      });
      if (porNcm.length) return porNcm;
    }
    const q = (termo ?? "").trim();
    if (q.length >= 3) {
      return await prisma.cest.findMany({
        where: { descricao: { contains: q, mode: "insensitive" } },
        orderBy: { codigo: "asc" },
        take: limite,
        select: { codigo: true, descricao: true }
      });
    }
    return [];
  } catch {
    return [];
  }
}

export type MunicipioOption = { codigo: string; nome: string; uf: string };

/** Municípios de uma UF (para seletor de endereço). */
export async function listMunicipios(uf: string): Promise<MunicipioOption[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await prisma.municipio.findMany({
      where: { uf: uf.trim().toUpperCase() },
      orderBy: { nome: "asc" },
      select: { codigo: true, nome: true, uf: true }
    });
  } catch {
    return [];
  }
}

/** Busca um município pelo código IBGE (validação/preenchimento). */
export async function findMunicipio(codigo: string): Promise<MunicipioOption | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const c = (codigo ?? "").replace(/\D/g, "");
    if (c.length !== 7) return null;
    return await prisma.municipio.findUnique({ where: { codigo: c }, select: { codigo: true, nome: true, uf: true } });
  } catch {
    return null;
  }
}
