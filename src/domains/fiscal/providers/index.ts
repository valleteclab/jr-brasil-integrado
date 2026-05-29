import type { ProvedorFiscal } from "@prisma/client";
import type { FiscalProvider } from "./types";
import { ManualFiscalProvider } from "./manual-provider";
import { HttpFiscalProvider } from "./http-provider";

const manual = new ManualFiscalProvider();

/**
 * Resolve a implementação de provedor fiscal a partir da configuração da empresa.
 * MANUAL/INTERNO usam o provedor interno (homologação funcional); os demais usam o
 * adapter HTTP genérico, configurável por baseUrl/token.
 */
export function resolveFiscalProvider(provedor: ProvedorFiscal): FiscalProvider {
  switch (provedor) {
    case "MANUAL":
    case "INTERNO":
      return manual;
    case "FOCUS_NFE":
    case "NFEIO":
    case "PLUGNOTAS":
    case "WEBMANIA":
      return new HttpFiscalProvider(provedor);
    default:
      return manual;
  }
}

export * from "./types";
