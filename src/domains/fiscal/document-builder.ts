import type { FinalidadeNfe, ModeloFiscal } from "@prisma/client";
import type { NormalizedFiscalDocument, NormalizedFiscalItem, ObraInfo, RetencoesFiscais, SubstituicaoNfse, TaxationTypeIss } from "./types";

type ProdutoFiscalLike = {
  sku: string;
  nome: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  origem: string | null;
  unidade: string;
  fiscal?: { ncm: string | null; cest: string | null; origem: string | null; regraTributariaId: string | null; icmsSt?: boolean | null } | null;
};

type ClienteEnderecoLike = {
  uf: string;
  padrao: boolean;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep?: string | null;
  cidade?: string | null;
  codigoMunicipioIbge?: string | null;
};

export type ClienteLike = {
  razaoSocial: string;
  documento: string | null;
  inscricaoEstadual: string | null;
  enderecos?: ClienteEnderecoLike[];
  contatos?: Array<{ email: string | null; principal: boolean }>;
};

function destinatarioFromCliente(cliente: ClienteLike) {
  const endereco = cliente.enderecos?.find((e) => e.padrao) ?? cliente.enderecos?.[0];
  const contato = cliente.contatos?.find((c) => c.principal) ?? cliente.contatos?.[0];
  return {
    nome: cliente.razaoSocial,
    documento: cliente.documento ?? null,
    inscricaoEstadual: cliente.inscricaoEstadual ?? null,
    email: contato?.email ?? null,
    uf: endereco?.uf ?? null,
    endereco: endereco
      ? {
          logradouro: endereco.logradouro ?? null,
          numero: endereco.numero ?? null,
          complemento: endereco.complemento ?? null,
          bairro: endereco.bairro ?? null,
          cep: endereco.cep ?? null,
          cidade: endereco.cidade ?? null,
          uf: endereco.uf ?? null,
          codigoMunicipioIbge: endereco.codigoMunicipioIbge ?? null
        }
      : null
  };
}

function itemFromProduto(
  produto: ProdutoFiscalLike,
  quantidade: number,
  valorUnitario: number,
  desconto: number
): NormalizedFiscalItem {
  const valorTotal = Math.round((quantidade * valorUnitario + Number.EPSILON) * 100) / 100;
  return {
    produtoId: null,
    codigo: produto.sku,
    descricao: produto.nome,
    ncm: produto.fiscal?.ncm ?? produto.ncm,
    cest: produto.fiscal?.cest ?? produto.cest,
    // CFOP explícito do produto prevalece; caso contrário é derivado na emissão (origem/destino).
    cfop: produto.cfop ?? null,
    unidade: produto.unidade,
    quantidade,
    valorUnitario,
    valorTotal,
    desconto,
    origem: produto.fiscal?.origem ?? produto.origem ?? "0",
    regraTributariaId: produto.fiscal?.regraTributariaId ?? null,
    icmsSt: produto.fiscal?.icmsSt ?? false,
    servico: false,
    itemListaServico: null
  };
}

export type PedidoFiscalInput = {
  cliente: ClienteLike;
  naturezaOperacao?: string;
  formaPagamento?: string | null;
  /** Pagamentos detalhados (com bandeira do cartão) — geram um detPag por forma na nota. */
  pagamentos?: Array<{ forma: string; valor: number; bandeira?: string | null }> | null;
  condicaoPagamento?: string | null;
  observacoes?: string | null;
  frete?: number;
  /** Modalidade do frete (modFrete). Quando ausente, o provedor deriva pelo valor do frete. */
  modalidadeFrete?: number | null;
  desconto?: number;
  modelo?: ModeloFiscal;
  finalidade?: FinalidadeNfe;
  /** NF-e de devolução: chave de acesso da nota original referenciada. */
  chaveReferenciada?: string | null;
  valorSeguro?: number;
  outrasDespesas?: number;
  itens: Array<{
    produto: ProdutoFiscalLike & { id: string };
    quantidade: number;
    precoUnitario: number;
    desconto?: number;
  }>;
};

/** Constrói um documento NF-e/NFC-e a partir de um pedido de venda já carregado. */
export function buildDocumentFromPedido(input: PedidoFiscalInput): NormalizedFiscalDocument {
  const modelo = input.modelo ?? "NFE";
  const itens = input.itens.map((linha) => ({
    ...itemFromProduto(linha.produto, linha.quantidade, linha.precoUnitario, linha.desconto ?? 0),
    produtoId: linha.produto.id
  }));
  // A SEFAZ exige que ICMSTot.vDesc == sum(det[i].prod.vDesc). Como o XML não tem campo de
  // desconto "de documento", o desconto global precisa ser rateado por item antes de emitir,
  // senão rejeita ("Total do Desconto difere do somatorio dos itens"). Faz o rateio pelo peso
  // de cada item (valorTotal-desconto já existente) e zera o desconto de documento.
  const descontoDoc = round2(input.desconto ?? 0);
  if (descontoDoc > 0 && itens.length > 0) {
    const bases = itens.map((it) => Math.max(round2(it.valorTotal - it.desconto), 0));
    const baseTotal = round2(bases.reduce((s, v) => s + v, 0));
    if (baseTotal > 0) {
      let aplicado = 0;
      for (let i = 0; i < itens.length; i++) {
        const cota = i === itens.length - 1
          ? round2(descontoDoc - aplicado)
          : round2((bases[i] / baseTotal) * descontoDoc);
        itens[i].desconto = round2(itens[i].desconto + cota);
        aplicado = round2(aplicado + cota);
      }
    }
  }
  return {
    modelo,
    finalidade: input.finalidade ?? "NORMAL",
    naturezaOperacao: input.naturezaOperacao ?? "Venda de mercadoria",
    ambiente: "HOMOLOGACAO",
    provedor: "MANUAL",
    serie: "",
    chaveReferenciada: input.chaveReferenciada ?? null,
    destinatario: destinatarioFromCliente(input.cliente),
    formaPagamento: input.formaPagamento ?? null,
    pagamentos: input.pagamentos ?? null,
    condicaoPagamento: input.condicaoPagamento ?? null,
    informacoesComplementares: input.observacoes ?? null,
    valorFrete: input.frete ?? 0,
    modalidadeFrete: input.modalidadeFrete ?? null,
    valorSeguro: input.valorSeguro ?? 0,
    // Rateado em itens acima — zerar aqui evita dupla contagem em ICMSTot.vDesc.
    valorDesconto: 0,
    outrasDespesas: input.outrasDespesas ?? 0,
    itens
  };
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export type OrdemServicoFiscalInput = {
  cliente: ClienteLike;
  observacoes?: string | null;
  formaPagamento?: string | null;
  condicaoPagamento?: string | null;
  codigoMunicipioIbge?: string | null;
  servicos: Array<{ descricao: string; valor: number; itemListaServico?: string | null; codigoNbs?: string | null; cClassTrib?: string | null; aliquotaIss?: number | null; baseIss?: number | null }>;
  retencoes?: RetencoesFiscais | null;
  taxationType?: TaxationTypeIss | null;
  obra?: ObraInfo | null;
  substituicao?: SubstituicaoNfse | null;
};

/** Constrói uma NFS-e a partir dos serviços (mão de obra) de uma OS. */
export function buildNfseFromOrdemServico(input: OrdemServicoFiscalInput): NormalizedFiscalDocument {
  return {
    modelo: "NFSE",
    finalidade: "NORMAL",
    naturezaOperacao: "Prestação de serviço",
    ambiente: "HOMOLOGACAO",
    provedor: "MANUAL",
    serie: "",
    destinatario: destinatarioFromCliente(input.cliente),
    formaPagamento: input.formaPagamento ?? null,
    condicaoPagamento: input.condicaoPagamento ?? null,
    informacoesComplementares: input.observacoes ?? null,
    valorFrete: 0,
    valorSeguro: 0,
    valorDesconto: 0,
    outrasDespesas: 0,
    itens: input.servicos.map((servico) => ({
      produtoId: null,
      codigo: "SERV",
      descricao: servico.descricao,
      ncm: null,
      cest: null,
      cfop: null,
      unidade: "UN",
      quantidade: 1,
      valorUnitario: servico.valor,
      valorTotal: servico.valor,
      desconto: 0,
      origem: null,
      regraTributariaId: null,
      servico: true,
      itemListaServico: servico.itemListaServico ?? null,
      codigoNbs: servico.codigoNbs ?? null,
      cClassTribServico: servico.cClassTrib ?? null,
      aliquotaIssInformada: servico.aliquotaIss ?? null,
      baseIssInformada: servico.baseIss ?? null
    })),
    retencoes: input.retencoes ?? null,
    taxationType: input.taxationType ?? null,
    obra: input.obra ?? null,
    substituicao: input.substituicao ?? null
  };
}
