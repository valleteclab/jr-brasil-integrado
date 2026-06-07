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
