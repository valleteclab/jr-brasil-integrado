import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { estornarBaixaReceivable, settleReceivable } from "@/domains/finance/application/finance-use-cases";
import { gerarTxid } from "@/domains/finance/providers/sicoob-pix";
import { getBankProvider, contaTemPix, contaSandbox, bancoLabel } from "@/domains/finance/providers/bank-registry";

/**
 * PIX RECEBIMENTOS (Sicoob): cobrança dinâmica com QR Code. Dois usos:
 *  - Venda no caixa/PDV: QR gerado na hora para o cliente pagar; o operador confirma e finaliza.
 *  - Título do contas a receber: "Cobrar via Pix" — quando o pagamento cai, a baixa é automática
 *    (settleReceivable), igual ao boleto liquidado.
 * A chave recebedora é a chave Pix cadastrada na conta bancária; a credencial é a mesma da cobrança.
 */

export class PixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PixError";
  }
}

/** Contas aptas a gerar QR Pix dinâmico: chave Pix cadastrada + credenciamento Sicoob. */
export async function listContasComPix(scope: TenantScope): Promise<Array<{ id: string; nome: string; chavePix: string }>> {
  const contas = await prisma.contaBancaria.findMany({
    where: { ...scopedByTenantCompany(scope), ativo: true, chavePix: { not: null } },
    orderBy: { nome: "asc" }
  });
  return contas
    .filter((c) => contaTemPix(c))
    .map((c) => ({ id: c.id, nome: c.nome, chavePix: c.chavePix as string }));
}

export type PixCriado = {
  id: string;
  txid: string;
  brcode: string | null;
  /** QR pronto para <img src> (data URL PNG) — null quando o BR Code não veio (sandbox mock). */
  qrDataUrl: string | null;
  valor: number;
  status: string;
  aviso: string | null;
};

async function montarQr(brcode: string | null): Promise<string | null> {
  if (!brcode?.trim()) return null;
  try {
    return await QRCode.toDataURL(brcode.trim(), { margin: 1, width: 320 });
  } catch {
    return null;
  }
}

/**
 * Cria uma cobrança Pix dinâmica. Quando `contaReceberId` é informado, o pagamento futuro baixa o
 * título automaticamente (cron/verificação); sem vínculo é um QR de venda à vista (o operador
 * confirma no caixa e finaliza normalmente).
 */
export async function criarPixCobranca(
  scope: TenantScope,
  input: {
    contaBancariaId: string;
    valor: number;
    descricao?: string | null;
    pedidoVendaId?: string | null;
    contaReceberId?: string | null;
    expiracaoSeg?: number;
  },
  usuarioId?: string
): Promise<PixCriado> {
  const valor = Math.round(Number(input.valor) * 100) / 100;
  if (!(valor > 0)) throw new PixError("Valor da cobrança Pix inválido.");
  const conta = await prisma.contaBancaria.findFirst({ where: { id: input.contaBancariaId, ...scopedByTenantCompany(scope), ativo: true } });
  if (!conta) throw new PixError("Conta bancária não encontrada.");
  if (!conta.chavePix?.trim()) throw new PixError(`Cadastre a chave Pix da conta "${conta.nome}" para gerar QR Code.`);
  if (!contaTemPix(conta)) throw new PixError(`A conta "${conta.nome}" não tem o credenciamento ${bancoLabel(conta)} (Pix) configurado.`);

  if (input.contaReceberId) {
    const titulo = await prisma.contaReceber.findFirst({ where: { id: input.contaReceberId, ...scopedByTenantCompany(scope) }, include: { pixCobranca: true } });
    if (!titulo) throw new PixError("Conta a receber não encontrada.");
    if (!["ABERTO", "PARCIAL", "VENCIDO"].includes(titulo.status)) throw new PixError(`O título não está em aberto (${titulo.status}).`);
    if (titulo.pixCobranca && titulo.pixCobranca.status === "ATIVA") {
      // Reusa a cobrança ativa em vez de criar outra (evita QRs duplicados para o mesmo título).
      return {
        id: titulo.pixCobranca.id,
        txid: titulo.pixCobranca.txid,
        brcode: titulo.pixCobranca.brcode,
        qrDataUrl: await montarQr(titulo.pixCobranca.brcode),
        valor: Number(titulo.pixCobranca.valor),
        status: titulo.pixCobranca.status,
        aviso: null
      };
    }
  }

  const provider = await getBankProvider(scope, conta);
  const txid = gerarTxid();
  const cob = await provider.criarCobrancaPix({
    txid,
    chave: conta.chavePix.trim(),
    valor,
    expiracaoSeg: input.expiracaoSeg ?? 3600,
    solicitacaoPagador: input.descricao ?? undefined
  });

  const registro = await prisma.pixCobranca.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      ambiente: scope.ambiente,
      contaBancariaId: conta.id,
      contaReceberId: input.contaReceberId ?? null,
      pedidoVendaId: input.pedidoVendaId ?? null,
      txid: cob.txid,
      status: "ATIVA",
      valor,
      chave: conta.chavePix.trim(),
      brcode: cob.brcode,
      descricao: input.descricao ?? null,
      expiracaoSeg: input.expiracaoSeg ?? 3600,
      payload: cob.bruto as object
    }
  });
  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId, entidade: "PixCobranca", entidadeId: registro.id, acao: "CREATE",
    payload: { txid: cob.txid, valor, contaReceberId: input.contaReceberId ?? null, pedidoVendaId: input.pedidoVendaId ?? null }
  }));

  // Tempo real: garante o webhook Pix da conta (fire-and-forget; PUT idempotente no banco).
  garantirWebhookPix(scope, conta.id).catch((e) => {
    console.error("[pix] webhook não registrado:", e instanceof Error ? e.message : e);
  });

  const sandboxSemBrcode = !cob.brcode && contaSandbox(conta);
  return {
    id: registro.id,
    txid: cob.txid,
    brcode: cob.brcode,
    qrDataUrl: await montarQr(cob.brcode),
    valor,
    status: "ATIVA",
    aviso: sandboxSemBrcode
      ? `O SANDBOX do ${bancoLabel(conta)} devolve dados de exemplo — o BR Code real (QR pagável) só vem em produção.`
      : null
  };
}

/**
 * Consulta a cobrança no Sicoob e sincroniza: CONCLUIDA + título vinculado em aberto → baixa
 * automática com crédito na conta (mesma mecânica do boleto liquidado).
 */
export async function sincronizarPix(scope: TenantScope, pixCobrancaId: string) {
  const pix = await prisma.pixCobranca.findFirst({
    where: { id: pixCobrancaId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: {
      contaBancaria: true,
      contaReceber: { select: { status: true, valor: true, juros: true, multa: true, descontoBaixa: true, valorPago: true } }
    }
  });
  if (!pix) throw new PixError("Cobrança Pix não encontrada.");
  const provider = await getBankProvider(scope, pix.contaBancaria);
  const consulta = await provider.consultarCobrancaPix(pix.txid);
  const status = (consulta.status ?? "").toUpperCase();

  if (status === "CONCLUIDA") {
    if (pix.contaReceberId && pix.contaReceber && ["ABERTO", "PARCIAL", "VENCIDO"].includes(pix.contaReceber.status)) {
      const t = pix.contaReceber;
      const saldo = Math.round((Number(t.valor) + Number(t.juros) + Number(t.multa) - Number(t.descontoBaixa) - Number(t.valorPago)) * 100) / 100;
      await settleReceivable(scope, pix.contaReceberId, {
        valor: consulta.valorPago && consulta.valorPago > 0 ? Math.min(consulta.valorPago, saldo) : saldo,
        formaPagamento: "PIX",
        contaBancariaId: pix.contaBancariaId,
        dataPagamento: consulta.pagoEm ? new Date(consulta.pagoEm) : new Date()
      });
    }
    await prisma.pixCobranca.update({
      where: { id: pix.id },
      data: {
        status: "CONCLUIDA",
        e2eid: consulta.e2eid,
        pagoEm: consulta.pagoEm ? new Date(consulta.pagoEm) : new Date(),
        payload: consulta.bruto as object
      }
    });
    return { status: "CONCLUIDA", pago: true, baixado: Boolean(pix.contaReceberId) };
  }
  if (status.startsWith("REMOVIDA")) {
    await prisma.pixCobranca.update({ where: { id: pix.id }, data: { status: "REMOVIDA", payload: consulta.bruto as object } });
    return { status: "REMOVIDA", pago: false, baixado: false };
  }
  await prisma.pixCobranca.update({ where: { id: pix.id }, data: { payload: consulta.bruto as object } });
  return { status: status || "ATIVA", pago: false, baixado: false };
}

/**
 * DEVOLVE o Pix recebido de um título (valor TOTAL, pelo endToEndId do pagamento) E estorna a
 * baixa no ERP — as duas pontas de uma vez: o dinheiro volta ao pagador no banco (padrão BACEN,
 * cai em segundos) e o título reabre com o saldo da conta ajustado. Exige pix.write no
 * credenciamento do app Sicoob.
 */
export async function devolverPixDoTitulo(scope: TenantScope, contaReceberId: string, usuarioId?: string) {
  const pix = await prisma.pixCobranca.findFirst({
    where: { contaReceberId, tenantId: scope.tenantId, empresaId: scope.empresaId },
    include: { contaBancaria: true }
  });
  if (!pix) throw new PixError("Este título não tem cobrança Pix.");
  if (pix.status === "DEVOLVIDA") return { status: "DEVOLVIDA", estornado: false, jaDevolvido: true };
  if (pix.status !== "CONCLUIDA") throw new PixError(`A cobrança Pix não está paga (${pix.status}) — nada a devolver.`);

  const provider = await getBankProvider(scope, pix.contaBancaria);

  // endToEndId do pagamento: normalmente salvo na sincronização; se faltar, busca na consulta.
  let e2eid = pix.e2eid;
  if (!e2eid) {
    const consulta = await provider.consultarCobrancaPix(pix.txid);
    e2eid = consulta.e2eid;
    if (e2eid) await prisma.pixCobranca.update({ where: { id: pix.id }, data: { e2eid } });
  }
  if (!e2eid) throw new PixError(`Pagamento sem endToEndId no ${bancoLabel(pix.contaBancaria)} — faça a devolução pelo app do banco.`);

  const valor = Number(pix.valor);
  const dev = await provider.devolverPix(e2eid, pix.id, valor);

  await prisma.pixCobranca.update({
    where: { id: pix.id },
    data: { status: "DEVOLVIDA", payload: dev.bruto as object }
  });

  // Estorna a baixa no ERP (título reabre; movimento inverso ajusta o saldo da conta).
  let estornado = false;
  const titulo = await prisma.contaReceber.findFirst({
    where: { id: contaReceberId, ...scopedByTenantCompany(scope) },
    select: { status: true, valorPago: true }
  });
  if (titulo && Number(titulo.valorPago) > 0 && ["PAGO", "PARCIAL"].includes(titulo.status)) {
    await estornarBaixaReceivable(scope, contaReceberId);
    estornado = true;
  }

  await prisma.$transaction(async (tx) => createAuditLog(tx, {
    scope, usuarioId, entidade: "PixCobranca", entidadeId: pix.id, acao: "PIX_DEVOLVIDO",
    payload: { contaReceberId, e2eid, valor, statusDevolucao: dev.status, estornado }
  }));

  return { status: dev.status ?? "EM_PROCESSAMENTO", estornado, jaDevolvido: false };
}

/**
 * Garante o WEBHOOK Pix da conta no banco: o Sicoob chama o ERP a cada Pix recebido na chave —
 * confirmação em TEMPO REAL no caixa/PDV (o cron fica como rede de segurança). PUT idempotente.
 * A URL pública carrega um segredo por conta (mesmo campo do webhook de cobrança); o receiver
 * NUNCA confia no corpo — sempre re-consulta a API do banco antes de baixar/confirmar.
 */
export async function garantirWebhookPix(scope: TenantScope, contaBancariaId: string): Promise<void> {
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaBancariaId, ...scopedByTenantCompany(scope), ativo: true } });
  if (!conta?.chavePix?.trim()) return;
  const baseUrl = (process.env.ERP_BASE ?? process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//.test(baseUrl)) return; // sem endereço público (dev local) → só cron
  const provider = await getBankProvider(scope, conta);
  if (!provider.registrarWebhookPix) return; // banco sem suporte → só cron
  const secret = conta.sicoobWebhookSecret ?? randomBytes(24).toString("hex");
  await provider.registrarWebhookPix(conta.chavePix.trim(), `${baseUrl}/api/webhooks/sicoob/pix/${secret}`);
  if (!conta.sicoobWebhookSecret) {
    await prisma.contaBancaria.update({ where: { id: conta.id }, data: { sicoobWebhookSecret: secret } });
  }
}

/**
 * Processa o WEBHOOK Pix (rota pública): identifica a conta pelo segredo da URL, coleta os txids
 * citados no corpo (defensivo — qualquer formato) e re-consulta cada cobrança no banco antes de
 * confirmar (sincronizarPix faz a baixa + crédito). Corpo sem txid → sincroniza as ATIVAS da conta.
 */
export async function processarWebhookPix(secret: string, payload: unknown): Promise<{ processadas: number; pagas: number }> {
  const conta = await prisma.contaBancaria.findFirst({ where: { sicoobWebhookSecret: secret, ativo: true } });
  if (!conta) throw new PixError("Webhook desconhecido.");

  const txids = new Set<string>();
  (function coletar(v: unknown, profundidade = 0): void {
    if (profundidade > 6 || v == null) return;
    if (Array.isArray(v)) { v.slice(0, 200).forEach((x) => coletar(x, profundidade + 1)); return; }
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (/^txid$/i.test(k) && typeof val === "string") txids.add(val);
        else coletar(val, profundidade + 1);
      }
    }
  })(payload);

  const cobrancas = await prisma.pixCobranca.findMany({
    where: {
      tenantId: conta.tenantId,
      empresaId: conta.empresaId,
      contaBancariaId: conta.id,
      status: "ATIVA",
      ...(txids.size ? { txid: { in: [...txids] } } : { criadoEm: { gte: new Date(Date.now() - 48 * 3600 * 1000) } })
    },
    take: 50,
    select: { id: true, tenantId: true, empresaId: true, ambiente: true }
  });

  let pagas = 0;
  for (const c of cobrancas) {
    const scope = { tenantId: c.tenantId, empresaId: c.empresaId, ambiente: c.ambiente } as TenantScope;
    try {
      const r = await sincronizarPix(scope, c.id);
      if (r.pago) pagas++;
    } catch (e) {
      console.error("[webhook pix] sincronização falhou:", e instanceof Error ? e.message : e);
    }
  }
  return { processadas: cobrancas.length, pagas };
}

/**
 * CRON: sincroniza as cobranças Pix ATIVAS recentes (últimas 48h — depois disso já expiraram).
 * Pagamento confirmado em título vinculado vira baixa automática com crédito na conta.
 */
export async function sincronizarPixCron(): Promise<{ pendentes: number; pagos: number; erros: string[] }> {
  const corte = new Date(Date.now() - 48 * 3600 * 1000);
  const pendentes = await prisma.pixCobranca.findMany({
    where: { status: "ATIVA", criadoEm: { gte: corte } },
    orderBy: { criadoEm: "asc" },
    take: 200,
    select: { id: true, tenantId: true, empresaId: true, ambiente: true, descricao: true, txid: true }
  });
  let pagos = 0;
  const erros: string[] = [];
  for (const p of pendentes) {
    const scope = { tenantId: p.tenantId, empresaId: p.empresaId, ambiente: p.ambiente } as TenantScope;
    try {
      const r = await sincronizarPix(scope, p.id);
      if (r.pago) pagos++;
    } catch (e) {
      erros.push(`${p.descricao ?? p.txid}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return { pendentes: pendentes.length, pagos, erros };
}
