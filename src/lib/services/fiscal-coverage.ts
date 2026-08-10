import { listCoberturaSefaz } from "@/domains/fiscal/providers/sefaz/endpoints";
import { listUfsComQrCode } from "@/domains/fiscal/providers/sefaz/qrcode-nfce";

/**
 * Cobertura fiscal da plataforma por modelo — derivada dos mapas REAIS do código
 * (nada mantido à mão): NF-e/NFC-e dos endpoints SEFAZ; NFS-e da lista de provedores.
 */
export type FiscalCoverage = {
  nfe: string[];
  /** NFC-e operável = endpoint SVRS + URLs de QR Code configuradas. */
  nfce: string[];
  /** NFC-e com endpoint mas SEM QR configurado (falta 1 passo p/ habilitar). */
  nfceSoEndpoint: string[];
  nfse: { escopo: string; detalhe: string }[];
};

export function getFiscalCoverage(): FiscalCoverage {
  const { nfe, nfceEndpoints } = listCoberturaSefaz();
  const comQr = new Set(listUfsComQrCode());
  return {
    nfe,
    nfce: nfceEndpoints.filter((uf) => comQr.has(uf)),
    nfceSoEndpoint: nfceEndpoints.filter((uf) => !comQr.has(uf)),
    nfse: [
      { escopo: "Emissor Nacional (SEFIN)", detalhe: "Qualquer município aderente ao padrão nacional — emissão direta com A1 (validado em produção)." },
      { escopo: "Brasília-DF (ISSnet)", detalhe: "Sistema próprio do DF no leiaute nacional — emissão e cancelamento integrados (aguarda 1º emitente inscrito)." }
    ]
  };
}
