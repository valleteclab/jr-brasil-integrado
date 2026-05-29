import type { AmbienteFiscal, FinalidadeNfe, ModeloFiscal, ProvedorFiscal } from "@prisma/client";

/** Tributos calculados para um item de documento fiscal de saída. */
export type ItemTaxResult = {
  origem: string;
  cstIcms: string | null;
  csosn: string | null;
  baseIcms: number;
  aliquotaIcms: number;
  valorIcms: number;
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
};

/** Documento fiscal normalizado independente de provedor. */
export type NormalizedFiscalDocument = {
  modelo: ModeloFiscal;
  finalidade: FinalidadeNfe;
  naturezaOperacao: string;
  ambiente: AmbienteFiscal;
  provedor: ProvedorFiscal;
  serie: string;
  destinatario: {
    nome: string;
    documento: string | null;
    inscricaoEstadual: string | null;
    email: string | null;
    uf: string | null;
  };
  formaPagamento: string | null;
  condicaoPagamento: string | null;
  informacoesComplementares: string | null;
  valorFrete: number;
  valorSeguro: number;
  valorDesconto: number;
  outrasDespesas: number;
  itens: NormalizedFiscalItem[];
};
