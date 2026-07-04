/**
 * ABSTRAÇÃO MULTIBANCO — interface normalizada de cobrança (boleto), Pix e conta-corrente/extrato.
 *
 * Cada banco (Sicoob, Sicredi, Itaú) implementa esta interface a partir das credenciais da própria
 * ContaBancaria. Os use-cases do financeiro (boleto/pix/extrato) falam SÓ com esta interface, sem
 * saber de qual banco se trata — quem decide é o `bank-registry` a partir de `conta.banco`.
 *
 * Operações não suportadas por um banco lançam BankUnsupportedError (ex.: extrato no Sicredi só existe
 * via Open Finance; extrato Itaú depende de contrato Cash Management com doc autenticada).
 */

export type BancoId = "SICOOB" | "SICREDI" | "ITAU";

export class BankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankError";
  }
}

/** Operação que o banco não expõe por API pública/contratada — mensagem explica a alternativa. */
export class BankUnsupportedError extends BankError {
  constructor(message: string) {
    super(message);
    this.name = "BankUnsupportedError";
  }
}

// ─────────────────────────── Boleto ───────────────────────────

export type BoletoPagador = {
  numeroCpfCnpj: string;
  nome: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  uf: string;
  email?: string;
};

export type BoletoInput = {
  seuNumero: string;
  valor: number;
  dataVencimento: string; // YYYY-MM-DD
  dataEmissao: string; // YYYY-MM-DD
  pagador: BoletoPagador;
  /** Frase(s) de instrução/mensagem no boleto (ex.: "Referente a: ..."). */
  mensagens?: string[];
};

export type BoletoRegistrado = {
  nossoNumero: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  pdfBase64: string | null;
  /** BR Code do Pix híbrido (bolecode), quando o banco devolve QR no registro. */
  qrCodePix?: string | null;
  bruto: unknown;
};

export type BoletoConsulta = {
  /** Situação normalizada em texto (contém "LIQUID" / "BAIXA" / "EM ABERTO"...). */
  situacao: string | null;
  valorPago: number | null;
  dataPagamento: string | null; // YYYY-MM-DD
  bruto: unknown;
};

export type WebhookInfo = { idWebhook: number; descricaoSituacao: string | null };

// ─────────────────────────── Pix ───────────────────────────

export type PixCobInput = {
  txid: string;
  chave: string;
  valor: number;
  expiracaoSeg?: number;
  solicitacaoPagador?: string;
  devedor?: { cpf?: string; cnpj?: string; nome: string } | null;
};

export type PixCobCriada = {
  txid: string;
  status: string | null;
  brcode: string | null;
  location: string | null;
  bruto: unknown;
};

export type PixCobConsulta = {
  status: string | null;
  valorPago: number | null;
  e2eid: string | null;
  pagoEm: string | null;
  bruto: unknown;
};

export type PixDevolucaoResult = {
  id: string;
  status: string | null;
  bruto: unknown;
};

// ─────────────────────────── Conta-corrente ───────────────────────────

export type SaldoConta = {
  saldo: number | null;
  saldoLimite: number | null;
  saldoBloqueado: number | null;
};

export type TransacaoExtrato = {
  data: string | null;
  descricao: string;
  numeroDocumento: string | null;
  /** Valor em reais, POSITIVO para crédito e NEGATIVO para débito. */
  valor: number;
  tipo: string | null;
  cpfCnpj: string | null;
  informacoesComplementares: string | null;
};

export type ExtratoConta = {
  saldoAnterior: number | null;
  saldoAtual: number | null;
  transacoes: TransacaoExtrato[];
};

export type ExtratoParams = { mes: number; ano: number; diaInicial: number; diaFinal: number };

// ─────────────────────────── Provedor ───────────────────────────

/** Recursos suportados por um provedor bancário (a UI usa para mostrar/ocultar botões). */
export type BankCaps = {
  boleto: boolean;
  pix: boolean;
  extrato: boolean;
  /** Baixa em tempo real por webhook de liquidação (hoje só Sicoob). */
  webhookCobranca: boolean;
};

/**
 * Provedor bancário já vinculado a UMA ContaBancaria (credenciais + certificado carregados sob
 * demanda). Todos os métodos podem lançar BankError/BankUnsupportedError.
 */
export interface BankProvider {
  readonly banco: BancoId;
  readonly caps: BankCaps;

  // Boleto
  incluirBoleto(input: BoletoInput): Promise<BoletoRegistrado>;
  consultarBoleto(nossoNumero: string): Promise<BoletoConsulta>;
  baixarBoleto(nossoNumero: string): Promise<void>;
  prorrogarBoleto(nossoNumero: string, dataVencimento: string): Promise<void>;
  cadastrarWebhookCobranca(url: string, email: string): Promise<number>;
  consultarWebhooksCobranca(): Promise<WebhookInfo[]>;

  // Pix
  criarCobrancaPix(input: PixCobInput): Promise<PixCobCriada>;
  consultarCobrancaPix(txid: string): Promise<PixCobConsulta>;
  devolverPix(e2eId: string, idDevolucao: string, valor: number): Promise<PixDevolucaoResult>;

  // Conta-corrente
  consultarSaldo(numeroContaCorrente: string): Promise<SaldoConta>;
  consultarExtrato(numeroContaCorrente: string, params: ExtratoParams): Promise<ExtratoConta>;
}

/** Metadados dos bancos suportados — rótulos e quais campos de credencial cada um usa (para a UI). */
export const BANCOS: Record<BancoId, {
  label: string;
  caps: BankCaps;
  /** Campos de credencial exibidos no formulário da conta (na ordem). */
  campos: Array<{ key: string; label: string; help?: string; secreto?: boolean; obrigatorio?: boolean }>;
  ajuda: string;
}> = {
  SICOOB: {
    label: "Sicoob",
    caps: { boleto: true, pix: true, extrato: true, webhookCobranca: true },
    campos: [], // Sicoob mantém a tela própria (SicoobCobrancaConfig) com seus campos sicoob*.
    ajuda: "Cobrança, Pix e extrato pela API oficial do Sicoob (mTLS com o A1 da empresa)."
  },
  SICREDI: {
    label: "Sicredi",
    caps: { boleto: true, pix: true, extrato: false, webhookCobranca: false },
    campos: [
      { key: "bancoBeneficiario", label: "Código do beneficiário", help: "Cobrança — código do convênio de cobrança", obrigatorio: true },
      { key: "bancoCooperativa", label: "Cooperativa", help: "4 dígitos", obrigatorio: true },
      { key: "bancoPosto", label: "Posto", help: "2 dígitos" },
      { key: "bancoApiKey", label: "x-api-key (token do portal)", help: "Cobrança — Access Token liberado por chamado no Portal do Desenvolvedor", secreto: true },
      { key: "bancoAcesso", label: "Código de acesso (senha)", help: "Cobrança — gerado no Internet Banking (Cobrança → Código de Acesso)", secreto: true },
      { key: "bancoClientId", label: "client_id (Pix)", help: "Pix — client_id da APP no Portal do Desenvolvedor" },
      { key: "bancoClientSecret", label: "client_secret (Pix)", help: "Pix — client_secret da APP", secreto: true }
    ],
    ajuda: "Cobrança (boleto) via API Parceiros (x-api-key + código de acesso) e Pix padrão BACEN (client_id/secret + mTLS com o A1). Extrato do Sicredi só via Open Finance — não disponível aqui."
  },
  ITAU: {
    label: "Itaú",
    caps: { boleto: true, pix: true, extrato: false, webhookCobranca: false },
    campos: [
      { key: "bancoClientId", label: "client_id", help: "Credencial CASH/BOLECODE (boleto) ou Pix Recebimentos", obrigatorio: true },
      { key: "bancoClientSecret", label: "client_secret", secreto: true, obrigatorio: true },
      { key: "bancoBeneficiario", label: "ID do beneficiário", help: "id_beneficiario do convênio de cobrança" },
      { key: "bancoCooperativa", label: "Agência", help: "4 dígitos" },
      { key: "bancoConta", label: "Conta corrente" },
      { key: "bancoConvenio", label: "Carteira", help: "Código da carteira de cobrança" }
    ],
    ajuda: "Cobrança (Cash Management v2) e Pix Recebimentos padrão BACEN, com OAuth2 client_credentials + mTLS (A1). Extrato depende de contrato Cash Management (doc autenticada) — não disponível aqui."
  }
};

export function bancoValido(v: string | null | undefined): BancoId {
  return v === "SICREDI" || v === "ITAU" ? v : "SICOOB";
}
