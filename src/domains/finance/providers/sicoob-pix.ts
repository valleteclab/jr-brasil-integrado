import { randomBytes } from "node:crypto";
import { type SicoobAuth, SicoobError, parseErroSicoob, sicoobApi } from "./sicoob-http";

/**
 * Cliente da API PIX Recebimentos do Sicoob (padrão BACEN, v2) — cobrança imediata (cob/QR Code).
 * A chave Pix recebedora vem do cadastro da conta bancária (ContaBancaria.chavePix).
 */

const PIX = {
  prodBase: "https://api.sicoob.com.br/pix/api/v2",
  sandboxBase: "https://sandbox.sicoob.com.br/sicoob/sandbox/pix/api/v2",
  scopes: "cob.read cob.write pix.read webhook.read webhook.write"
};

/** txid BACEN: 26–35 caracteres alfanuméricos, único por cobrança. Prefixo ERP + aleatório. */
export function gerarTxid(): string {
  return `ERP${randomBytes(16).toString("hex")}`.slice(0, 35);
}

export type PixCobCriada = {
  txid: string;
  status: string | null;
  brcode: string | null;
  location: string | null;
  bruto: unknown;
};

/** Cria/atualiza uma cobrança imediata (PUT /cob/{txid}) e devolve o BR Code (copia-e-cola do QR). */
export async function criarCobrancaImediata(
  auth: SicoobAuth,
  input: {
    txid: string;
    chave: string;
    valor: number;
    expiracaoSeg?: number;
    solicitacaoPagador?: string;
    devedor?: { cpf?: string; cnpj?: string; nome: string } | null;
  }
): Promise<PixCobCriada> {
  const payload = {
    calendario: { expiracao: input.expiracaoSeg ?? 3600 },
    ...(input.devedor?.nome ? { devedor: input.devedor } : {}),
    valor: { original: input.valor.toFixed(2) },
    chave: input.chave,
    ...(input.solicitacaoPagador ? { solicitacaoPagador: input.solicitacaoPagador.slice(0, 140) } : {})
  };
  const res = await sicoobApi(auth, PIX, "PUT", `/cob/${input.txid}`, payload);
  if (res.statusCode < 200 || res.statusCode >= 300) throw new SicoobError(parseErroSicoob(res));
  let data: unknown = {};
  try { data = JSON.parse(res.body); } catch { /* vazio */ }
  const b = (data ?? {}) as Record<string, unknown>;
  const loc = (b.loc ?? {}) as Record<string, unknown>;
  return {
    txid: (b.txid as string) ?? input.txid,
    status: (b.status as string) ?? null,
    // brcode pode vir na raiz (Sicoob) ou dentro de loc; produção também expõe pixCopiaECola.
    brcode: (b.brcode as string) ?? (b.pixCopiaECola as string) ?? (loc.brcode as string) ?? null,
    location: (b.location as string) ?? (loc.location as string) ?? null,
    bruto: data
  };
}

export type PixCobConsulta = {
  status: string | null;
  valorPago: number | null;
  e2eid: string | null;
  pagoEm: string | null;
  bruto: unknown;
};

/** Consulta uma cobrança imediata; quando paga, `pix[]` traz endToEndId, valor e horário. */
export async function consultarCobrancaImediata(auth: SicoobAuth, txid: string): Promise<PixCobConsulta> {
  const res = await sicoobApi(auth, PIX, "GET", `/cob/${txid}`);
  if (res.statusCode < 200 || res.statusCode >= 300) throw new SicoobError(parseErroSicoob(res));
  let data: unknown = {};
  try { data = JSON.parse(res.body); } catch { /* vazio */ }
  const b = (data ?? {}) as Record<string, unknown>;
  const pagamentos = Array.isArray(b.pix) ? (b.pix as Array<Record<string, unknown>>) : [];
  const pg = pagamentos[0] ?? null;
  return {
    status: (b.status as string) ?? null,
    valorPago: pg?.valor != null ? Number(pg.valor) : null,
    e2eid: (pg?.endToEndId as string) ?? null,
    pagoEm: (pg?.horario as string) ?? null,
    bruto: data
  };
}

/** Registra o webhook Pix da chave: o Sicoob chama a URL a cada Pix recebido nessa chave. */
export async function registrarWebhookPix(auth: SicoobAuth, chave: string, url: string): Promise<void> {
  const res = await sicoobApi(auth, PIX, "PUT", `/webhook/${encodeURIComponent(chave)}`, { webhookUrl: url });
  if (res.statusCode < 200 || res.statusCode >= 300) throw new SicoobError(parseErroSicoob(res));
}
