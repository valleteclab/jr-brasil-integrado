import type { AmbienteFiscal, FinalidadeNfe, ModeloFiscal, ProvedorFiscal } from "@prisma/client";

/** Tributos calculados para um item de documento fiscal de saída. */
export type ItemTaxResult = {
  origem: string;
  cstIcms: string | null;
  csosn: string | null;
  baseIcms: number;
  aliquotaIcms: number;
  valorIcms: number;
  percentualFcp: number;
  valorFcp: number;
  modalidadeBcSt: string | null;
  percentualMva: number;
  baseIcmsSt: number;
  aliquotaIcmsSt: number;
  valorIcmsSt: number;
  cstIpi: string | null;
  aliquotaIpi: number;
  valorIpi: number;
  cstPis: string | null;
  aliquotaPis: number;
  valorPis: number;
  cstCofins: string | null;
  aliquotaCofins: number;
  valorCofins: number;
  itemListaServico: string | null;
  aliquotaIss: number;
  valorIss: number;
  /** Valor aproximado dos tributos do item (Lei 12.741 / transparência). */
  valorTributos: number;
  cClassTrib: string | null;
};

/** Item normalizado de um documento fiscal, pronto para cálculo e emissão. */
export type NormalizedFiscalItem = {
  produtoId: string | null;
  codigo: string;
  descricao: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  desconto: number;
  origem: string | null;
  regraTributariaId: string | null;
  /** Serviço (NFS-e) versus produto (NF-e/NFC-e). */
  servico: boolean;
  itemListaServico: string | null;
  /** NFS-e: código NBS (Nomenclatura Brasileira de Serviços, 9 dígitos), exigido no cServ. */
  codigoNbs?: string | null;
  /** NFS-e/Reforma Tributária: código de classificação tributária IBS/CBS (cClassTrib, 6 dígitos). */
  cClassTribServico?: string | null;
  /** NFS-e: alíquota de ISS informada (%) que sobrepõe a regra tributária, quando definida. */
  aliquotaIssInformada?: number | null;
  /** NFS-e: base de cálculo do ISS informada (após deduções), quando diferente do valor do serviço. */
  baseIssInformada?: number | null;
};

/** Documento fiscal normalizado independente de provedor. */
export type NormalizedFiscalDocument = {
  modelo: ModeloFiscal;
  finalidade: FinalidadeNfe;
  naturezaOperacao: string;
  ambiente: AmbienteFiscal;
  provedor: ProvedorFiscal;
  serie: string;
  /** NF-e de devolução: chave de acesso (44 dígitos) da nota original referenciada (NFref/refNFe). */
  chaveReferenciada?: string | null;
  destinatario: {
    nome: string;
    documento: string | null;
    inscricaoEstadual: string | null;
    email: string | null;
    uf: string | null;
    /** Endereço do destinatário (necessário para provedores externos como Spedy). */
    endereco: {
      logradouro: string | null;
      numero: string | null;
      complemento: string | null;
      bairro: string | null;
      cep: string | null;
      cidade: string | null;
      uf: string | null;
      codigoMunicipioIbge: string | null;
    } | null;
  };
  formaPagamento: string | null;
  condicaoPagamento: string | null;
  /** Pagamentos do documento (NFC-e/NF-e): múltiplas formas → vários detPag. Quando ausente,
   *  o provedor usa formaPagamento como pagamento único pelo valor total. */
  pagamentos?: Array<{ forma: string; valor: number }> | null;
  informacoesComplementares: string | null;
  valorFrete: number;
  /**
   * Modalidade do frete (tag modFrete da SEFAZ):
   * 0=Contratação por conta do emitente (CIF) · 1=por conta do destinatário (FOB) ·
   * 2=por conta de terceiros · 3=transporte próprio por conta do emitente ·
   * 4=transporte próprio por conta do destinatário · 9=sem transporte.
   * Quando ausente, o provedor deriva: 9 se não há frete, senão 0.
   */
  modalidadeFrete?: number | null;
  valorSeguro: number;
  valorDesconto: number;
  outrasDespesas: number;
  itens: NormalizedFiscalItem[];
  /** Retenções na fonte (principalmente NFS-e): ISS retido + retenções federais. */
  retencoes?: RetencoesFiscais | null;
  /** NFS-e: natureza/exigibilidade do ISS (valor do enum do provedor). */
  taxationType?: TaxationTypeIss | null;
};

/** Natureza/exigibilidade do ISS na NFS-e (alinhado ao enum ServiceInvoiceTaxationType da Spedy). */
export type TaxationTypeIss =
  | "taxationInMunicipality"
  | "taxationOutsideMunicipality"
  | "exemption"
  | "immune"
  | "suspendedByCourt"
  | "suspendedByAdministrativeProcedure"
  | "exportation"
  | "nonIncidence";

/** Retenção de um tributo na fonte. Alíquota em percentual; valor em reais. */
export type RetencaoTributo = {
  aliquota: number;
  valor: number;
};

/**
 * Retenções na fonte de uma NFS-e. `issRetido` indica que o ISS é retido pelo tomador.
 * As retenções federais (IRRF, PIS, COFINS, CSLL, INSS) só são preenchidas quando há
 * retenção — tipicamente quando o tomador é pessoa jurídica obrigada a reter.
 */
export type RetencoesFiscais = {
  issRetido: boolean;
  ir?: RetencaoTributo | null;
  pis?: RetencaoTributo | null;
  cofins?: RetencaoTributo | null;
  csll?: RetencaoTributo | null;
  inss?: RetencaoTributo | null;
  /** Total retido (IRRF+PIS+COFINS+CSLL+INSS [+ISS quando retido]). */
  totalRetido: number;
  /** Valor líquido a receber (valor da NF − retenções). */
  valorLiquido: number;
};
