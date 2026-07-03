import { type SicoobAuth, SicoobError, parseErroSicoob, sicoobApi } from "./sicoob-http";

/**
 * Cliente da API CONTA-CORRENTE do Sicoob (v4) — saldo e extrato, usados na conciliação bancária
 * (extrato do banco × movimentos do ERP) e na detecção de créditos de antecipação de recebíveis.
 */

const CONTA = {
  prodBase: "https://api.sicoob.com.br/conta-corrente/v4",
  sandboxBase: "https://sandbox.sicoob.com.br/sicoob/sandbox/conta-corrente/v4",
  // Escopos OFICIAIS da Conta Corrente v4: openid + cco_extrato + cco_saldo ("cco_consulta" NÃO
  // existe — derruba o token de produção com invalid_scope).
  scopes: "openid cco_extrato cco_saldo"
};

export type SaldoConta = {
  saldo: number | null;
  saldoLimite: number | null;
  saldoBloqueado: number | null;
};

export async function consultarSaldo(auth: SicoobAuth, numeroContaCorrente: string): Promise<SaldoConta> {
  const res = await sicoobApi(auth, CONTA, "GET", `/saldo?numeroContaCorrente=${encodeURIComponent(numeroContaCorrente)}`);
  if (res.statusCode < 200 || res.statusCode >= 300) throw new SicoobError(parseErroSicoob(res));
  let data: unknown = {};
  try { data = JSON.parse(res.body); } catch { /* vazio */ }
  const raiz = ((data as { resultado?: unknown }).resultado ?? data) as Record<string, unknown>;
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };
  return { saldo: num(raiz.saldo), saldoLimite: num(raiz.saldoLimite), saldoBloqueado: num(raiz.saldoBloqueado) };
}

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

/** Extrato de um período dentro de um mês (GET /extrato/{mes}/{ano}?diaInicial&diaFinal). */
export async function consultarExtrato(
  auth: SicoobAuth,
  params: { numeroContaCorrente: string; mes: number; ano: number; diaInicial: number; diaFinal: number }
): Promise<ExtratoConta> {
  const qs = new URLSearchParams({
    diaInicial: String(params.diaInicial),
    diaFinal: String(params.diaFinal),
    numeroContaCorrente: params.numeroContaCorrente,
    agruparCNAB: "false"
  }).toString();
  const res = await sicoobApi(auth, CONTA, "GET", `/extrato/${params.mes}/${params.ano}?${qs}`);
  if (res.statusCode < 200 || res.statusCode >= 300) throw new SicoobError(parseErroSicoob(res));
  let data: unknown = {};
  try { data = JSON.parse(res.body); } catch { /* vazio */ }
  const raiz = ((data as { resultado?: unknown }).resultado ?? data) as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    // O extrato devolve valores como string ("1.234,56" ou "1234.56", conforme o canal) — normaliza.
    if (v == null) return null;
    const s = String(v).trim();
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };
  const lista = Array.isArray(raiz.transacoes) ? (raiz.transacoes as Array<Record<string, unknown>>) : [];
  const transacoes: TransacaoExtrato[] = [];
  for (const t of lista) {
    const tipo = (t.tipo as string) ?? null;
    const bruto = num(t.valor);
    if (bruto == null) continue;
    // tipo: DEBITO | CREDITO. Sinaliza débito como negativo para casar com os movimentos do ERP.
    const debito = /d[eé]b/i.test(tipo ?? "");
    transacoes.push({
      data: (t.data as string) ?? (t.dataLote as string) ?? null,
      descricao: ((t.descricao as string) ?? "").trim(),
      numeroDocumento: (t.numeroDocumento as string) ?? null,
      valor: debito ? -Math.abs(bruto) : Math.abs(bruto),
      tipo,
      cpfCnpj: (t.cpfCnpj as string) ?? null,
      informacoesComplementares: (t.descInfComplementar as string) ?? null
    });
  }
  return { saldoAnterior: num(raiz.saldoAnterior), saldoAtual: num(raiz.saldoAtual), transacoes };
}
