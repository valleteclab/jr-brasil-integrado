import type { ProvedorFiscal } from "@prisma/client";
import type { FiscalProvider } from "./types";
import { ManualFiscalProvider } from "./manual-provider";
import { HttpFiscalProvider } from "./http-provider";
import { SpedyFiscalProvider } from "./spedy-provider";
import { FocusNfeProvider } from "./focus-nfe-provider";
import { AcbrFiscalProvider } from "./acbr-provider";

const manual = new ManualFiscalProvider();

/**
 * Resolve a implementação de provedor fiscal a partir da configuração da empresa.
 * MANUAL/INTERNO usam o provedor interno (homologação funcional); Spedy e Focus NFe
 * têm implementações dedicadas; os demais usam o adapter HTTP genérico, configurável
 * por baseUrl/token.
 */
export function resolveFiscalProvider(provedor: ProvedorFiscal): FiscalProvider {
  switch (provedor) {
    case "MANUAL":
    case "INTERNO":
      return manual;
    case "SPEDY":
      return new SpedyFiscalProvider();
    case "FOCUS_NFE":
      return new FocusNfeProvider();
    case "ACBR":
      return new AcbrFiscalProvider();
    case "NFEIO":
    case "PLUGNOTAS":
    case "WEBMANIA":
      return new HttpFiscalProvider(provedor);
    default:
      return manual;
  }
}

export * from "./types";
