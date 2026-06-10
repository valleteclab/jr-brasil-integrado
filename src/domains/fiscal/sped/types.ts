/**
 * Tipos do gerador de SPED Fiscal (EFD ICMS/IPI).
 *
 * O gerador (gerador.ts) é PURO: recebe um SpedInput já carregado do banco (dados.ts)
 * e devolve o arquivo .txt + resumo estruturado (exibido na tela) + avisos.
 */

export type SpedPeriodo = {
  ano: number;
  mes: number; // 1-12
  inicio: Date;
  fim: Date;
};

export type SpedEmpresa = {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  uf: string | null;
  codigoMunicipioIbge: string | null;
  nomeFantasia: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  telefone: string | null;
  email: string | null;
  regimeTributario: string;
};

export type SpedContador = {
  nome: string | null;
  cpf: string | null;
  crc: string | null;
  cnpj: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  telefone: string | null;
  email: string | null;
  codigoMunicipioIbge: string | null;
};

export type SpedConfig = {
  perfilArquivo: "A" | "B" | "C";
  indAtividade: "0" | "1";
  finalidade: "ORIGINAL" | "RETIFICADORA";
  contador: SpedContador;
  codigoReceitaIcms: string | null;
  diaVencimentoIcms: number;
  saldoCredorAnterior: number;
  saldoCredorAnteriorIpi: number;
  /** ICMS Antecipação Parcial (compras interestaduais p/ revenda — ex.: BA). */
  antecipacaoParcialAtiva: boolean;
  codAjusteDebitoAntecipacao: string | null; // BA: BA050004 (débito especial)
  codAjusteCreditoAntecipacao: string | null; // BA: BA020002 (crédito conta-corrente)
  codigoReceitaAntecipacao: string | null; // BA: 2175 (DAE)
  diaVencimentoAntecipacao: number;
  /** CIAP (bloco G): código de ajuste E111 da tabela 5.1.1 da UF para o crédito mensal. */
  codAjusteCreditoCiap: string | null;
  /** Bloco K restrito ao saldo de estoque (K010 modo 2 + K200). */
  gerarBlocoK: boolean;
};

/** Bem do CIAP com a parcela do período já resolvida (bloco G). */
export type SpedCiapBem = {
  codigo: string; // COD_IND_BEM
  descricao: string;
  identMerc: string; // 1 = bem, 2 = componente
  funcao: string | null;
  vidaUtilAnos: number;
  valorIcmsOp: number;
  valorIcmsSt: number;
  valorIcmsFrete: number;
  valorIcmsDif: number;
  parcelasTotal: number;
  /** Nº da parcela apropriada NESTE período (1..parcelasTotal). */
  parcelaNumero: number;
  /** Valor da parcela mensal passível de apropriação (total ÷ parcelas). */
  valorParcela: number;
  /** Saldo de ICMS do bem no INÍCIO do período (antes desta parcela). */
  saldoInicial: number;
  /** true no mês da imobilização (G125 TIPO_MOV=IM, com G130/G140 do documento). */
  novoNoPeriodo: boolean;
  // Documento de aquisição (G130) e item (G140) — exigidos quando novoNoPeriodo.
  codigoParticipante: string | null;
  docModelo: string | null;
  docSerie: string | null;
  docNumero: string | null;
  chaveAcesso: string | null;
  docEmitidaEm: Date | null;
  itemCodigo: string | null;
  itemQuantidade: number;
  itemUnidade: string | null;
};

/** Participante (registro 0150): cliente das saídas ou fornecedor das entradas. */
export type SpedParticipante = {
  codigo: string; // COD_PART (id interno)
  nome: string;
  cnpj: string | null;
  cpf: string | null;
  inscricaoEstadual: string | null;
  codigoMunicipioIbge: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  /** UF do participante (não vai para o 0150, mas alimenta relatórios — livro de entradas). */
  uf: string | null;
};

/** Item de catálogo (registro 0200). */
export type SpedItemCatalogo = {
  codigo: string; // COD_ITEM
  descricao: string;
  gtin: string | null;
  unidade: string;
  tipoItem: string; // TIPO_ITEM (00 revenda, 01 matéria-prima, 07 uso/consumo, 09 serviço...)
  ncm: string | null;
  cest: string | null;
};

/** Item de documento fiscal já normalizado para C170/C190. */
export type SpedDocumentoItem = {
  numeroItem: number;
  codigoItem: string; // referencia um SpedItemCatalogo
  descricaoComplementar: string | null;
  quantidade: number;
  unidade: string;
  valorItem: number;
  valorDesconto: number;
  movimentaEstoque: boolean;
  cfop: string;
  cstIcms: string; // 3 dígitos (origem + CST)
  baseIcms: number;
  aliquotaIcms: number;
  valorIcms: number;
  baseIcmsSt: number;
  aliquotaIcmsSt: number;
  valorIcmsSt: number;
  valorReducaoBc: number;
  cstIpi: string | null;
  baseIpi: number;
  aliquotaIpi: number;
  valorIpi: number;
  cstPis: string | null;
  basePis: number;
  aliquotaPis: number;
  valorPis: number;
  cstCofins: string | null;
  baseCofins: number;
  aliquotaCofins: number;
  valorCofins: number;
  /** ICMS Antecipação Parcial do item (entrada interestadual p/ revenda, sem ST). */
  antecipacaoParcial: number;
  /**
   * Crédito de ICMS de fornecedor do Simples (art. 23 LC 123) apropriado neste item:
   * o documento vem SEM destaque e o crédito (pCredSN/vCredICMSSN ou infCpl) é escriturado
   * em base/alíquota/valor com CST 90 sob o enfoque do declarante.
   */
  creditoSimplesLc123?: boolean;
};

/** Documento fiscal (C100): saída emitida pela empresa ou entrada de terceiro. */
export type SpedDocumento = {
  tipo: "SAIDA" | "ENTRADA";
  modelo: "55" | "65";
  cancelado: boolean;
  codigoParticipante: string | null; // null para NFC-e
  serie: string | null;
  numero: string | null;
  chaveAcesso: string | null;
  dataEmissao: Date | null;
  dataEntradaSaida: Date | null;
  aPrazo: boolean;
  valorDocumento: number;
  valorDesconto: number;
  valorMercadorias: number;
  valorFrete: number;
  valorSeguro: number;
  outrasDespesas: number;
  /** UF de destino (saídas com ICMS-ST) — usada para agrupar o E200. */
  ufDestino: string | null;
  itens: SpedDocumentoItem[];
  /** Identificação amigável para avisos ("NF-e 123 série 1"). */
  rotulo: string;
};

/** Inventário (bloco H) apurado de um Inventario CONCLUIDO no período. */
export type SpedInventario = {
  data: Date;
  itens: Array<{ codigoItem: string; unidade: string; quantidade: number; valorUnitario: number }>;
};

export type SpedInput = {
  periodo: SpedPeriodo;
  empresa: SpedEmpresa;
  config: SpedConfig;
  versaoLeiaute: string; // COD_VER (ex.: "020")
  participantes: SpedParticipante[];
  itensCatalogo: SpedItemCatalogo[];
  documentos: SpedDocumento[];
  inventario: SpedInventario | null;
  /** Bens do CIAP com apropriação no período (bloco G). Vazio → G001 sem movimento. */
  ciapBens: SpedCiapBem[];
  /** Saldo de estoque do fim do período (bloco K restrito — K200). null → K001 sem movimento. */
  estoqueFinal: Array<{ codigoItem: string; quantidade: number }> | null;
  /** Avisos coletados na carga de dados (cadastros incompletos etc.). */
  avisos: string[];
};

// ---------------------------------------------------------------------------
// Saída do gerador
// ---------------------------------------------------------------------------

export type SpedApuracaoIcms = {
  debitos: number;
  ajustesDebito: number;
  estornosCredito: number;
  creditos: number;
  ajustesCredito: number;
  estornosDebito: number;
  saldoCredorAnterior: number;
  saldoApurado: number;
  deducoes: number;
  icmsARecolher: number;
  saldoCredorTransportar: number;
};

export type SpedApuracaoIpi = {
  debitos: number;
  creditos: number;
  saldoCredorAnterior: number;
  saldoDevedor: number;
  saldoCredorTransportar: number;
};

export type SpedLinhaCfop = {
  cfop: string;
  cstIcms: string;
  aliquota: number;
  valorOperacao: number;
  baseIcms: number;
  valorIcms: number;
  baseIcmsSt: number;
  valorIcmsSt: number;
  valorReducaoBc: number;
  valorIpi: number;
};

export type SpedResumo = {
  competencia: string; // "06/2026"
  periodo: { inicio: string; fim: string };
  versaoLeiaute: string;
  perfilArquivo: string;
  finalidade: string;
  regimeTributario: string;
  documentos: {
    saidasNfe: number;
    saidasNfce: number;
    saidasCanceladas: number;
    entradas: number;
    valorSaidas: number;
    valorEntradas: number;
  };
  apuracaoIcms: SpedApuracaoIcms;
  apuracaoIcmsSt: { total: number; porUf: Array<{ uf: string; valor: number }> };
  /**
   * ICMS Antecipação Parcial: guia recolhida à parte (débito especial + E116) e, no regime
   * de conta-corrente, creditada na apuração (E111). escriturada indica se os E111/E116
   * foram emitidos (códigos de ajuste resolvidos) ou se ficou apenas informativa.
   */
  antecipacaoParcial: {
    total: number;
    escriturada: boolean;
    linhas: Array<{ numero: string; fornecedor: string; base: number; valor: number }>;
  };
  /** Crédito de ICMS apropriado de fornecedores do Simples (art. 23 LC 123) — já dentro dos créditos. */
  creditoSimplesLc123: number;
  /** CIAP (bloco G): apropriação mensal do crédito do ativo imobilizado. */
  ciap: {
    saldoInicial: number;
    somaParcelas: number;
    fatorSaidasTributadas: number;
    creditoApropriado: number;
    /** false quando o código de ajuste E111 da UF não está configurado (crédito fora do E110). */
    escriturado: boolean;
    bens: Array<{ codigo: string; descricao: string; parcela: string; valorParcela: number }>;
  } | null;
  /** Bloco K: quantidade de itens com saldo informado no K200 (0 = sem movimento). */
  estoqueK200Itens: number;
  apuracaoIpi: SpedApuracaoIpi | null;
  /** PIS/COFINS dos documentos — informativo (a apuração formal é na EFD Contribuições). */
  pisCofins: { debitosPis: number; creditosPis: number; debitosCofins: number; creditosCofins: number };
  /**
   * Reforma tributária: no leiaute 020 (NT 2025.001), CBS/IBS/IS NÃO são escriturados na
   * EFD ICMS/IPI e não integram os totais. Mantido como nota informativa na tela.
   */
  reforma: { observacao: string };
  saidasPorCfop: SpedLinhaCfop[];
  entradasPorCfop: SpedLinhaCfop[];
  registros: Array<{ registro: string; quantidade: number }>;
  totalLinhas: number;
};

export type SpedArquivoGerado = {
  conteudo: string;
  totalLinhas: number;
  resumo: SpedResumo;
  avisos: string[];
};
