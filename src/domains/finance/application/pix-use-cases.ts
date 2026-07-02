import QRCode from "qrcode";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { authDaConta, contaTemCobranca } from "@/domains/finance/application/boleto-use-cases";
import { settleReceivable } from "@/domains/finance/application/finance-use-cases";
import { criarCobrancaImediata, consultarCobrancaImediata, gerarTxid } from "@/domains/finance/providers/sicoob-pix";

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
    where: { ...scopedByTenantCompany(scope), ativo: true, chavePix: { not: null }, sicoobNumeroCliente: { not: null } },
    orderBy: { nome: "asc" }
  });
  return contas
    .filter((c) => contaTemCobranca(c) && c.chavePix?.trim())
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
  if (!contaTemCobranca(conta)) throw new PixError(`A conta "${conta.nome}" não tem o credenciamento Sicoob configurado.`);

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

  const auth = await authDaConta(scope, conta);
  const txid = gerarTxid();
  const cob = await criarCobrancaImediata(auth, {
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

  const sandboxSemBrcode = !cob.brcode && conta.sicoobSandbox;
  return {
    id: registro.id,
    txid: cob.txid,
    brcode: cob.brcode,
    qrDataUrl: await montarQr(cob.brcode),
    valor,
    status: "ATIVA",
    aviso: sandboxSemBrcode
      ? "O SANDBOX do Sicoob devolve dados de exemplo — o BR Code real (QR pagável) só vem em produção."
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
  const auth = await authDaConta(scope, pix.contaBancaria);
  const consulta = await consultarCobrancaImediata(auth, pix.txid);
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
