import type { AmbienteFiscal, ModeloFiscal, ProvedorFiscal, StatusNotaFiscal } from "@prisma/client";
import type { NormalizedFiscalDocument } from "../types";
import type { DocumentTaxTotals } from "../tax-engine";

export type ProviderEmitter = {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  uf: string | null;
  codigoMunicipioIbge: string | null;
};

export type ProviderContext = {
  ambiente: AmbienteFiscal;
  provedor: ProvedorFiscal;
  baseUrl: string | null;
  /** Token de API já descriptografado. Nunca persistir/logar. */
  token: string | null;
  cscId: string | null;
  cscToken: string | null;
};

export type EmitInput = {
  document: NormalizedFiscalDocument;
  emitter: ProviderEmitter;
  numero: number;
  totals: DocumentTaxTotals;
  total: number;
};

export type EmitResult = {
  status: StatusNotaFiscal;
  chaveAcesso?: string;
  protocolo?: string;
  reciboLote?: string;
  providerRef?: string;
  xml?: string;
  xmlUrl?: string;
  danfeUrl?: string;
  motivo?: string;
};

export type CancelInput = {
  modelo: ModeloFiscal;
  chaveAcesso: string | null;
  providerRef: string | null;
  justificativa: string;
};

export type CancelResult = {
  status: "AUTORIZADO" | "REJEITADO" | "ERRO";
  protocolo?: string;
  motivo?: string;
};

export type CorrectionInput = {
  chaveAcesso: string | null;
  providerRef: string | null;
  sequencia: number;
  correcao: string;
};

export type CorrectionResult = {
  status: "AUTORIZADO" | "REJEITADO" | "ERRO";
  protocolo?: string;
  motivo?: string;
};

/**
 * Contrato único que todo provedor fiscal (interno, Focus NFe, NFe.io, PlugNotas,
 * Webmania...) deve implementar. A camada de emissão depende apenas desta interface,
 * então trocar de provedor é configuração — não mexe nas regras de negócio.
 */
export interface FiscalProvider {
  readonly id: ProvedorFiscal;
  emit(input: EmitInput, ctx: ProviderContext): Promise<EmitResult>;
  cancel(input: CancelInput, ctx: ProviderContext): Promise<CancelResult>;
  correct(input: CorrectionInput, ctx: ProviderContext): Promise<CorrectionResult>;
  queryStatus(chaveAcesso: string, ctx: ProviderContext): Promise<EmitResult>;
}
