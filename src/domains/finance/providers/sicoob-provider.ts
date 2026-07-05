import {
  incluirBoleto, consultarBoleto, baixarBoleto, prorrogarVencimentoBoleto,
  cadastrarWebhookCobranca, consultarWebhooksCobranca as consultarWebhooksCobrancaSicoob,
  type SicoobAuth
} from "./sicoob-cobranca";
import { criarCobrancaImediata, consultarCobrancaImediata, devolverPix, registrarWebhookPix as registrarWebhookPixSicoob } from "./sicoob-pix";
import { consultarSaldo, consultarExtrato } from "./sicoob-conta";
import { BANCOS,
  type BankProvider, type BoletoInput, type BoletoRegistrado, type BoletoConsulta,
  type PixCobInput, type PixCobCriada, type PixCobConsulta, type PixDevolucaoResult,
  type SaldoConta, type ExtratoConta, type ExtratoParams, type WebhookInfo
} from "./bank-provider";

/**
 * Provedor SICOOB — adapta os clientes sicoob-* (inalterados) à interface BankProvider. As credenciais
 * Sicoob (numeroCliente/modalidade/conta corrente) vêm dos campos sicoob* da própria ContaBancaria.
 */

export type SicoobProviderCtx = {
  auth: SicoobAuth;
  numeroCliente: number;
  codigoModalidade: number;
  numeroContaCorrente?: number;
};

export function createSicoobProvider(ctx: SicoobProviderCtx): BankProvider {
  const { auth, numeroCliente, codigoModalidade } = ctx;
  return {
    banco: "SICOOB",
    caps: BANCOS.SICOOB.caps,

    async incluirBoleto(input: BoletoInput): Promise<BoletoRegistrado> {
      const r = await incluirBoleto(auth, {
        numeroCliente,
        codigoModalidade,
        numeroContaCorrente: ctx.numeroContaCorrente,
        seuNumero: input.seuNumero,
        valor: input.valor,
        dataVencimento: input.dataVencimento,
        dataEmissao: input.dataEmissao,
        pagador: input.pagador,
        mensagensInstrucao: input.mensagens
      });
      return { ...r, qrCodePix: null };
    },

    consultarBoleto(nossoNumero: string): Promise<BoletoConsulta> {
      return consultarBoleto(auth, { numeroCliente, codigoModalidade, nossoNumero });
    },

    async baixarBoleto(nossoNumero: string): Promise<void> {
      await baixarBoleto(auth, { numeroCliente, codigoModalidade, nossoNumero });
    },

    async prorrogarBoleto(nossoNumero: string, dataVencimento: string): Promise<void> {
      await prorrogarVencimentoBoleto(auth, { numeroCliente, codigoModalidade, nossoNumero, dataVencimento });
    },

    cadastrarWebhookCobranca(url: string, email: string): Promise<number> {
      return cadastrarWebhookCobranca(auth, { url, email });
    },

    async consultarWebhooksCobranca(): Promise<WebhookInfo[]> {
      const lista = await consultarWebhooksCobrancaSicoob(auth);
      return lista.map((w) => ({ idWebhook: w.idWebhook, descricaoSituacao: w.descricaoSituacao }));
    },

    criarCobrancaPix(input: PixCobInput): Promise<PixCobCriada> {
      return criarCobrancaImediata(auth, {
        txid: input.txid,
        chave: input.chave,
        valor: input.valor,
        expiracaoSeg: input.expiracaoSeg,
        solicitacaoPagador: input.solicitacaoPagador,
        devedor: input.devedor
      });
    },

    consultarCobrancaPix(txid: string): Promise<PixCobConsulta> {
      return consultarCobrancaImediata(auth, txid);
    },

    devolverPix(e2eId: string, idDevolucao: string, valor: number): Promise<PixDevolucaoResult> {
      return devolverPix(auth, { e2eId, idDevolucao, valor });
    },

    registrarWebhookPix(chave: string, url: string): Promise<void> {
      return registrarWebhookPixSicoob(auth, chave, url);
    },

    consultarSaldo(numeroContaCorrente: string): Promise<SaldoConta> {
      return consultarSaldo(auth, numeroContaCorrente);
    },

    consultarExtrato(numeroContaCorrente: string, params: ExtratoParams): Promise<ExtratoConta> {
      return consultarExtrato(auth, { numeroContaCorrente, ...params });
    }
  };
}
