import { bankRequest, jsonOrEmpty, parseErroBacen, type BankHttpResult } from "./bank-http";
import {
  BankError, BankUnsupportedError, BANCOS,
  type BankProvider, type BoletoInput, type BoletoRegistrado, type BoletoConsulta,
  type PixCobInput, type PixCobCriada, type PixCobConsulta, type PixDevolucaoResult,
  type SaldoConta, type ExtratoConta, type ExtratoParams, type WebhookInfo
} from "./bank-provider";
import { normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * Provedor SICREDI. Duas APIs distintas (autenticações diferentes):
 *  - COBRANÇA/BOLETO: API Parceiros — OAuth2 grant_type=password (código de acesso do Internet
 *    Banking) + header x-api-key (token do Portal do Desenvolvedor). SEM mTLS.
 *  - PIX: padrão BACEN — OAuth2 client_credentials (Basic client_id:client_secret) + mTLS (A1).
 *  - EXTRATO: não há API própria (só Open Finance) — lança BankUnsupportedError.
 *
 * Base URLs (confirmadas no Manual da API da Cobrança e no Guia Técnico Pix Sicredi):
 *  - Cobrança: https://api-parceiro.sicredi.com.br  (sandbox: .../sb)
 *  - Pix: https://api-pix.sicredi.com.br  (homologação: https://api-pix-h.sicredi.com.br)
 */

export type SicrediCreds = {
  sandbox: boolean;
  // Cobrança
  beneficiario: string;
  cooperativa: string;
  posto: string;
  apiKey: string; // x-api-key (já descriptografado)
  codigoAcesso: string; // senha OAuth (já descriptografado)
  // Pix
  clientId: string;
  clientSecret: string;
  chavePix: string | null;
  /** A1 da empresa em PEM para o mTLS do Pix. */
  tls: { key: string; cert: string } | null;
};

const COBRANCA_PROD = "https://api-parceiro.sicredi.com.br";
const PIX_PROD = "https://api-pix.sicredi.com.br";
const PIX_HOMOLOG = "https://api-pix-h.sicredi.com.br";

export function createSicrediProvider(creds: SicrediCreds): BankProvider {
  const cobrancaBase = creds.sandbox ? `${COBRANCA_PROD}/sb` : COBRANCA_PROD;
  const pixBase = creds.sandbox ? PIX_HOMOLOG : PIX_PROD;

  // ───────────── Cobrança: OAuth password + x-api-key ─────────────
  async function tokenCobranca(): Promise<string> {
    if (!creds.apiKey.trim()) throw new BankError("Informe o x-api-key da cobrança Sicredi (token do Portal do Desenvolvedor).");
    if (!creds.beneficiario.trim() || !creds.cooperativa.trim()) throw new BankError("Informe o código do beneficiário e a cooperativa Sicredi.");
    if (!creds.codigoAcesso.trim()) throw new BankError("Informe o código de acesso (senha) da cobrança Sicredi (gerado no Internet Banking).");
    const body = new URLSearchParams({
      grant_type: "password",
      username: `${creds.beneficiario.trim()}${creds.cooperativa.trim()}`,
      password: creds.codigoAcesso.trim(),
      scope: "cobranca"
    }).toString();
    const res = await bankRequest(`${cobrancaBase}/auth/openapi/token`, {
      method: "POST",
      headers: {
        "x-api-key": creds.apiKey.trim(),
        context: "COBRANCA",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": String(Buffer.byteLength(body))
      }
    }, body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new BankError(`Falha na autenticação da cobrança Sicredi (HTTP ${res.statusCode}): ${res.body.slice(0, 300)}`);
    }
    const token = (jsonOrEmpty(res.body).access_token as string) ?? "";
    if (!token) throw new BankError("Autenticação da cobrança Sicredi não retornou access_token.");
    return token;
  }

  async function cobrancaApi(method: string, path: string, payload?: unknown): Promise<BankHttpResult> {
    const token = await tokenCobranca();
    const body = payload !== undefined ? JSON.stringify(payload) : undefined;
    return bankRequest(`${cobrancaBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": creds.apiKey.trim(),
        cooperativa: creds.cooperativa.trim(),
        posto: creds.posto.trim() || "00",
        context: "COBRANCA",
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) } : {})
      }
    }, body);
  }

  // ───────────── Pix: client_credentials + Basic + mTLS ─────────────
  async function tokenPix(scope: string): Promise<string> {
    if (!creds.clientId.trim() || !creds.clientSecret.trim()) throw new BankError("Informe o client_id e client_secret do Pix Sicredi.");
    if (!creds.sandbox && !creds.tls) throw new BankError("Certificado A1 da empresa não disponível para o mTLS do Pix Sicredi.");
    const qs = new URLSearchParams({ grant_type: "client_credentials", scope }).toString();
    const basic = Buffer.from(`${creds.clientId.trim()}:${creds.clientSecret.trim()}`).toString("base64");
    const res = await bankRequest(`${pixBase}/oauth/token?${qs}`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": "0" },
      tls: creds.sandbox ? null : creds.tls
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new BankError(`Falha na autenticação do Pix Sicredi (HTTP ${res.statusCode}): ${res.body.slice(0, 300)}`);
    }
    const token = (jsonOrEmpty(res.body).access_token as string) ?? "";
    if (!token) throw new BankError("Autenticação do Pix Sicredi não retornou access_token.");
    return token;
  }

  async function pixApi(method: string, path: string, scope: string, payload?: unknown): Promise<BankHttpResult> {
    const token = await tokenPix(scope);
    const body = payload !== undefined ? JSON.stringify(payload) : undefined;
    return bankRequest(`${pixBase}/api/v2${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) } : {})
      },
      tls: creds.sandbox ? null : creds.tls
    });
  }

  return {
    banco: "SICREDI",
    caps: BANCOS.SICREDI.caps,

    async incluirBoleto(input: BoletoInput): Promise<BoletoRegistrado> {
      const doc = normalizeDocumento(input.pagador.numeroCpfCnpj);
      const payload = {
        tipoCobranca: "NORMAL",
        codigoBeneficiario: creds.beneficiario.trim(),
        pagador: {
          tipoPessoa: doc.length > 11 ? "PESSOA_JURIDICA" : "PESSOA_FISICA",
          documento: doc,
          nome: input.pagador.nome,
          endereco: input.pagador.endereco,
          cidade: input.pagador.cidade,
          uf: input.pagador.uf,
          cep: input.pagador.cep.replace(/\D+/g, ""),
          ...(input.pagador.email ? { email: input.pagador.email } : {})
        },
        especieDocumento: "DUPLICATA_MERCANTIL_INDICACAO",
        seuNumero: input.seuNumero,
        dataVencimento: input.dataVencimento,
        valor: Number(input.valor.toFixed(2)),
        ...(input.mensagens?.length ? { mensagens: input.mensagens.slice(0, 4) } : {})
      };
      const res = await cobrancaApi("POST", "/cobranca/boleto/v1/boletos", payload);
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Sicredi", res));
      const b = jsonOrEmpty(res.body);
      const linhaDigitavel = (b.linhaDigitavel as string) ?? null;

      // O registro NÃO devolve o PDF; busca a 2ª via pela linha digitável (best-effort).
      let pdfBase64: string | null = null;
      if (linhaDigitavel) {
        try {
          const pdf = await cobrancaApi("GET", `/cobranca/boleto/v1/boletos/pdf?linhaDigitavel=${encodeURIComponent(linhaDigitavel.replace(/\D+/g, ""))}`);
          if (pdf.statusCode >= 200 && pdf.statusCode < 300 && pdf.body) {
            // Corpo pode vir como base64 puro ou dentro de { pdf: "..." }.
            const j = jsonOrEmpty(pdf.body);
            pdfBase64 = (j.pdf as string) ?? (j.arquivo as string) ?? (/^[A-Za-z0-9+/=\r\n]+$/.test(pdf.body.trim()) ? pdf.body.trim() : null);
          }
        } catch { /* PDF é opcional; segue com a linha digitável */ }
      }
      return {
        nossoNumero: b.nossoNumero != null ? String(b.nossoNumero) : null,
        linhaDigitavel,
        codigoBarras: (b.codigoBarras as string) ?? null,
        pdfBase64,
        qrCodePix: (b.qrCode as string) ?? null,
        bruto: b
      };
    },

    async consultarBoleto(nossoNumero: string): Promise<BoletoConsulta> {
      const qs = new URLSearchParams({ codigoBeneficiario: creds.beneficiario.trim(), nossoNumero }).toString();
      const res = await cobrancaApi("GET", `/cobranca/boleto/v1/boletos?${qs}`);
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Sicredi", res));
      const raiz = jsonOrEmpty(res.body);
      const b = (Array.isArray(raiz.itens) ? raiz.itens[0] : raiz) as Record<string, unknown>;
      return {
        situacao: (b.situacao as string) ?? (b.situacaoBoleto as string) ?? null,
        valorPago: b.valorLiquidado != null ? Number(b.valorLiquidado) : (b.valorPago != null ? Number(b.valorPago) : null),
        dataPagamento: (b.dataLiquidacao as string) ?? (b.dataPagamento as string) ?? null,
        bruto: b
      };
    },

    async baixarBoleto(nossoNumero: string): Promise<void> {
      const res = await cobrancaApi("PATCH", `/cobranca/boleto/v1/boletos/${nossoNumero}/baixa`, {
        codigoBeneficiario: creds.beneficiario.trim()
      });
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Sicredi", res));
    },

    async prorrogarBoleto(nossoNumero: string, dataVencimento: string): Promise<void> {
      const res = await cobrancaApi("PATCH", `/cobranca/boleto/v1/boletos/${nossoNumero}/data-vencimento`, {
        codigoBeneficiario: creds.beneficiario.trim(),
        dataVencimento
      });
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Sicredi", res));
    },

    async cadastrarWebhookCobranca(): Promise<number> {
      throw new BankUnsupportedError("Baixa em tempo real por webhook não está disponível no Sicredi neste ERP — a baixa ocorre pela sincronização periódica (cron).");
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
      const res = await pixApi("PUT", `/cob/${input.txid}`, "cob.write cob.read", payload);
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Sicredi", res));
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
      const res = await pixApi("GET", `/cob/${txid}`, "cob.read");
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Sicredi", res));
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
      const res = await pixApi("PUT", `/pix/${encodeURIComponent(e2eId)}/devolucao/${id}`, "pix.read pix.write", { valor: valor.toFixed(2) });
      if (res.statusCode < 200 || res.statusCode >= 300) throw new BankError(parseErroBacen("Sicredi", res));
      const b = jsonOrEmpty(res.body);
      return { id: (b.id as string) ?? id, status: (b.status as string) ?? null, bruto: b };
    },

    async consultarSaldo(): Promise<SaldoConta> {
      throw new BankUnsupportedError("Consulta de saldo do Sicredi só existe via Open Finance (consentimento do titular) — não disponível na API de parceiros.");
    },
    async consultarExtrato(_conta: string, _params: ExtratoParams): Promise<ExtratoConta> {
      throw new BankUnsupportedError("Extrato/conciliação do Sicredi só existe via Open Finance — não disponível pela API de parceiros. Use o extrato via arquivo ou Open Finance.");
    }
  };
}
