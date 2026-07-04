import { bankRequest, jsonOrEmpty, parseErroBacen, type BankHttpResult } from "./bank-http";
import {
  BankError, BankUnsupportedError, BANCOS,
  type BankProvider, type BoletoInput, type BoletoRegistrado, type BoletoConsulta,
  type PixCobInput, type PixCobCriada, type PixCobConsulta, type PixDevolucaoResult,
  type SaldoConta, type ExtratoConta, type ExtratoParams, type WebhookInfo
} from "./bank-provider";

/**
 * Provedor ITAÚ. Autenticação única: OAuth2 client_credentials + mTLS (certificado dinâmico/A1) em
 * produção; sandbox sem mTLS (token temporário).
 *  - BOLETO: API Cash Management v2 (POST /cash_management/v2/boletos).
 *  - PIX: Pix Recebimentos v2 (padrão BACEN: PUT /cob/{txid}, GET /cob/{txid}, devolução).
 *  - EXTRATO: existe no Cash Management, mas o endpoint depende de contrato e doc autenticada —
 *    lança BankUnsupportedError até termos o path liberado pelo gerente Cash do cliente.
 *
 * ATENÇÃO (validar-depois): o schema do payload de boleto v2 do Itaú está atrás de login/contrato.
 * Os campos abaixo seguem o que é público (id_beneficiario, dado_boleto, pagador); ao credenciar o
 * cliente, confira contra a doc autenticada e ajuste se necessário.
 */

export type ItauCreds = {
  sandbox: boolean;
  clientId: string;
  clientSecret: string;
  beneficiario: string; // id_beneficiario
  agencia: string;
  conta: string;
  carteira: string;
  chavePix: string | null;
  /** A1 da empresa em PEM para o mTLS. */
  tls: { key: string; cert: string } | null;
};

const STS_PROD = "https://sts.itau.com.br/api/oauth/token";
const STS_SANDBOX = "https://sts.itau.com.br/sandbox/api/oauth/token";
const CASH_PROD = "https://api.itau.com.br";
const CASH_GET_PROD = "https://secure.api.cloud.itau.com.br";
const PIX_PROD = "https://secure.api.itau.com.br/pix_recebimentos/v2";
const PIX_SANDBOX = "https://devportal.itau.com.br/sandboxapi/pix_recebimentos_ext_v2/v2";

export function createItauProvider(creds: ItauCreds): BankProvider {
  async function token(): Promise<string> {
    if (!creds.clientId.trim() || !creds.clientSecret.trim()) throw new BankError("Informe o client_id e client_secret do Itaú.");
    if (!creds.sandbox && !creds.tls) throw new BankError("Certificado A1 da empresa não disponível para o mTLS do Itaú.");
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId.trim(),
      client_secret: creds.clientSecret.trim()
    }).toString();
    const res = await bankRequest(creds.sandbox ? STS_SANDBOX : STS_PROD, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": String(Buffer.byteLength(body)) },
      tls: creds.sandbox ? null : creds.tls
    }, body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new BankError(`Falha na autenticação Itaú (HTTP ${res.statusCode}): ${res.body.slice(0, 300)}`);
    }
    const t = (jsonOrEmpty(res.body).access_token as string) ?? "";
    if (!t) throw new BankError("Autenticação Itaú não retornou access_token.");
    return t;
  }

  async function api(host: string, method: string, path: string, payload?: unknown): Promise<BankHttpResult> {
    const acc = await token();
    const body = payload !== undefined ? JSON.stringify(payload) : undefined;
    return bankRequest(`${host}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${acc}`,
        Accept: "application/json",
        "x-itau-apikey": creds.clientId.trim(),
        ...(body ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) } : {})
      },
      tls: creds.sandbox ? null : creds.tls
    });
  }

  const cashHost = creds.sandbox ? CASH_PROD : CASH_PROD; // sandbox de boleto não é mTLS; mesmo host base
  const pixBase = creds.sandbox ? PIX_SANDBOX : PIX_PROD;

  return {
    banco: "ITAU",
    caps: BANCOS.ITAU.caps,

    async incluirBoleto(input: BoletoInput): Promise<BoletoRegistrado> {
      const doc = input.pagador.numeroCpfCnpj.replace(/\D+/g, "");
      const payload = {
        etapa_processo_boleto: "efetivacao",
        beneficiario: { id_beneficiario: creds.beneficiario.trim() },
        dado_boleto: {
          descricao_instrumento_cobranca: "boleto",
          forma_envio: "impressao",
          codigo_carteira: creds.carteira.trim() || "109",
          valor_total_titulo: Math.round(input.valor * 100).toString().padStart(17, "0"),
          data_vencimento: input.dataVencimento,
          dados_individuais_boleto: [
            {
              numero_nosso_numero: input.seuNumero,
              data_vencimento: input.dataVencimento,
              valor_titulo: Math.round(input.valor * 100).toString().padStart(17, "0"),
              texto_seu_numero: input.seuNumero
            }
          ],
          pagador: {
            pessoa: {
              nome_pessoa: input.pagador.nome,
              tipo_pessoa: doc.length > 11
                ? { codigo_tipo_pessoa: "J", numero_cadastro_nacional_pessoa_juridica: doc }
                : { codigo_tipo_pessoa: "F", numero_cadastro_pessoa_fisica: doc }
            },
            endereco: {
              nome_logradouro: input.pagador.endereco,
              nome_bairro: input.pagador.bairro,
              nome_cidade: input.pagador.cidade,
              sigla_UF: input.pagador.uf,
              numero_CEP: input.pagador.cep.replace(/\D+/g, "")
            }
          },
          ...(input.mensagens?.length ? { mensagens_boleto: { mensagem: input.mensagens.slice(0, 4) } } : {})
        }
      };
      const res = await api(cashHost, "POST", "/cash_management/v2/boletos", payload);
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Itaú", res));
      const b = jsonOrEmpty(res.body);
      const dado = (b.dado_boleto ?? {}) as Record<string, unknown>;
      const individuais = Array.isArray(dado.dados_individuais_boleto) ? (dado.dados_individuais_boleto as Array<Record<string, unknown>>) : [];
      const ind = individuais[0] ?? {};
      return {
        nossoNumero: (ind.numero_nosso_numero as string) ?? (dado.numero_nosso_numero as string) ?? input.seuNumero,
        linhaDigitavel: (ind.numero_linha_digitavel as string) ?? (dado.numero_linha_digitavel as string) ?? null,
        codigoBarras: (ind.codigo_barras as string) ?? (dado.codigo_barras as string) ?? null,
        pdfBase64: null,
        qrCodePix: (dado.qrcode as string) ?? null,
        bruto: b
      };
    },

    async consultarBoleto(nossoNumero: string): Promise<BoletoConsulta> {
      const qs = new URLSearchParams({ id_beneficiario: creds.beneficiario.trim(), nosso_numero: nossoNumero }).toString();
      const res = await api(creds.sandbox ? cashHost : CASH_GET_PROD, "GET", `/cash_management/v2/boletos?${qs}`);
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Itaú", res));
      const b = jsonOrEmpty(res.body);
      const dado = (b.dado_boleto ?? b) as Record<string, unknown>;
      const situacao = (dado.situacao_geral_boleto as string) ?? (dado.codigo_situacao as string) ?? null;
      return {
        situacao,
        valorPago: dado.valor_total_recebido != null ? Number(dado.valor_total_recebido) / 100 : null,
        dataPagamento: (dado.data_efetivacao_pagamento as string) ?? null,
        bruto: b
      };
    },

    async baixarBoleto(nossoNumero: string): Promise<void> {
      const res = await api(cashHost, "POST", `/cash_management/v2/boletos/${nossoNumero}/baixa`, {
        beneficiario: { id_beneficiario: creds.beneficiario.trim() }
      });
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Itaú", res));
    },

    async prorrogarBoleto(nossoNumero: string, dataVencimento: string): Promise<void> {
      const res = await api(cashHost, "PATCH", `/cash_management/v2/boletos/${nossoNumero}`, {
        beneficiario: { id_beneficiario: creds.beneficiario.trim() },
        dado_boleto: { data_vencimento: dataVencimento }
      });
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Itaú", res));
    },

    async cadastrarWebhookCobranca(): Promise<number> {
      throw new BankUnsupportedError("Baixa em tempo real por webhook não está configurada para o Itaú neste ERP — a baixa ocorre pela sincronização periódica (cron).");
    },
    async consultarWebhooksCobranca(): Promise<WebhookInfo[]> {
      return [];
    },

    async criarCobrancaPix(input: PixCobInput): Promise<PixCobCriada> {
      const payload = {
        calendario: { expiracao: input.expiracaoSeg ?? 3600 },
        ...(input.devedor?.nome ? { devedor: input.devedor } : {}),
        valor: { original: input.valor.toFixed(2) },
        chave: input.chave,
        ...(input.solicitacaoPagador ? { solicitacaoPagador: input.solicitacaoPagador.slice(0, 140) } : {})
      };
      const res = await api(pixBase, "PUT", `/cob/${input.txid}`, payload);
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Itaú", res));
      const b = jsonOrEmpty(res.body);
      const loc = (b.loc ?? {}) as Record<string, unknown>;
      return {
        txid: (b.txid as string) ?? input.txid,
        status: (b.status as string) ?? null,
        brcode: (b.pixCopiaECola as string) ?? (b.brcode as string) ?? null,
        location: (b.location as string) ?? (loc.location as string) ?? null,
        bruto: b
      };
    },

    async consultarCobrancaPix(txid: string): Promise<PixCobConsulta> {
      const res = await api(pixBase, "GET", `/cob/${txid}`);
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Itaú", res));
      const b = jsonOrEmpty(res.body);
      const pagamentos = Array.isArray(b.pix) ? (b.pix as Array<Record<string, unknown>>) : [];
      const pg = pagamentos[0] ?? null;
      return {
        status: (b.status as string) ?? null,
        valorPago: pg?.valor != null ? Number(pg.valor) : null,
        e2eid: (pg?.endToEndId as string) ?? null,
        pagoEm: (pg?.horario as string) ?? null,
        bruto: b
      };
    },

    async devolverPix(e2eId: string, idDevolucao: string, valor: number): Promise<PixDevolucaoResult> {
      const id = idDevolucao.replace(/[^0-9a-zA-Z]/g, "").slice(0, 35) || "1";
      const res = await api(pixBase, "PUT", `/pix/${encodeURIComponent(e2eId)}/devolucao/${id}`, { valor: valor.toFixed(2) });
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Itaú", res));
      const b = jsonOrEmpty(res.body);
      return { id: (b.id as string) ?? id, status: (b.status as string) ?? null, bruto: b };
    },

    async consultarSaldo(): Promise<SaldoConta> {
      throw new BankUnsupportedError("Consulta de saldo do Itaú depende de contrato Cash Management (doc autenticada) — endpoint ainda não liberado neste ERP.");
    },
    async consultarExtrato(_conta: string, _params: ExtratoParams): Promise<ExtratoConta> {
      throw new BankUnsupportedError("Extrato/conciliação do Itaú depende de contrato Cash Management (doc autenticada) — endpoint ainda não liberado neste ERP.");
    }
  };
}
