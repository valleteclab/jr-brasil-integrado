import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { debitarCarteira, CreditoError } from "./carteira-use-cases";
import { normalizarBureau, type CreditoNormalizado } from "./bureau-normalizer";
import { consultarCreditoApiBrasil, getApiBrasilRuntime } from "@/lib/apibrasil/apibrasil-service";

/**
 * Consulta de crédito de um cliente (PF/PJ) no bureau, com CACHE e COBRANÇA:
 *  - reusa a última consulta válida (dentro de validadeConsultaDias) SEM custo;
 *  - senão, DEBITA o preço de revenda da carteira, chama o bureau, normaliza e grava.
 * Nunca dispara sozinha — só por ação explícita (botão/tool), com confirmação de custo.
 */

export type ResultadoConsulta = {
  id: string;
  emCache: boolean;
  consultadoEm: string;
  custo: number;
  normalizado: CreditoNormalizado;
  documento: string;
  tipoPessoa: "PF" | "PJ";
};

function tipoDoDocumento(documento: string): "PF" | "PJ" {
  return documento.replace(/\D/g, "").length > 11 ? "PJ" : "PF";
}

/** Última consulta válida (cache) para um documento neste tenant. */
export async function consultaValida(scope: TenantScope, documento: string) {
  const doc = documento.replace(/\D/g, "");
  return prisma.consultaCredito.findFirst({
    where: { tenantId: scope.tenantId, documento: doc, validoAte: { gt: new Date() } },
    orderBy: { consultadoEm: "desc" }
  });
}

/** Mapeia o registro do banco para o resultado exibível. */
function paraResultado(reg: NonNullable<Awaited<ReturnType<typeof consultaValida>>>, emCache: boolean): ResultadoConsulta {
  return {
    id: reg.id,
    emCache,
    consultadoEm: reg.consultadoEm.toISOString(),
    custo: Number(reg.custoRevenda),
    documento: reg.documento,
    tipoPessoa: reg.tipoPessoa as "PF" | "PJ",
    normalizado: reg.resultado as unknown as CreditoNormalizado
  };
}

export async function consultarCredito(
  scope: TenantScope,
  input: { documento: string; clienteId?: string | null; forcar?: boolean },
  usuarioId?: string
): Promise<ResultadoConsulta> {
  const documento = input.documento.replace(/\D/g, "");
  if (documento.length !== 11 && documento.length !== 14) throw new CreditoError("Informe um CPF (11) ou CNPJ (14) válido.");
  const tipo = tipoDoDocumento(documento);

  // 1) Cache (a menos que forçado a reconsultar).
  if (!input.forcar) {
    const cache = await consultaValida(scope, documento);
    if (cache) return paraResultado(cache, true);
  }

  const cfg = await prisma.plataformaCredito.findUnique({ where: { id: "default" } });
  if (!cfg) throw new CreditoError("Módulo de crédito não configurado pela plataforma.");
  const validadeDias = cfg.validadeConsultaDias ?? 60;

  const rt = await getApiBrasilRuntime();
  if (!rt) throw new CreditoError("Bureau (ApiBrasil) não configurado pela plataforma.");

  // Em HOMOLOGAÇÃO a ApiBrasil não tarifa e devolve dado fictício → NÃO debita a carteira do tenant
  // (custo 0). Em produção, debita o preço de revenda ANTES de chamar (garante saldo) e estorna se falhar.
  const preco = rt.sandbox ? 0 : Number(tipo === "PF" ? cfg.precoConsultaPF : cfg.precoConsultaPJ);

  if (preco > 0) await debitarCarteira(scope, preco, `Consulta de crédito ${tipo} ${documento}`, usuarioId);
  let bruto: unknown;
  try {
    const resp = await consultarCreditoApiBrasil(rt, tipo, documento);
    if (!resp.ok) {
      const msg = resp.body?.message;
      // PJ (SQOD) só responde em produção — em homolog dá "Tipo não suportado em homolog".
      const dica = tipo === "PJ" && rt.sandbox && /homolog/i.test(msg ?? "")
        ? " (o produto PJ só funciona em produção — desmarque Sandbox em Admin → Crédito & bureau)"
        : "";
      throw new CreditoError(msg ? `Bureau: ${msg}${dica}` : `Bureau retornou erro (HTTP ${resp.status}).`);
    }
    bruto = resp.body;
  } catch (e) {
    // Estorna o débito quando a consulta não completa (o cliente não pode pagar por consulta falha).
    if (preco > 0) await creditarEstorno(scope, preco, `Estorno — consulta ${tipo} ${documento} falhou`, usuarioId);
    throw e instanceof CreditoError ? e : new CreditoError(e instanceof Error ? e.message : "Falha na consulta ao bureau.");
  }

  const normalizado = normalizarBureau(bruto, tipo);
  const validoAte = new Date(Date.now() + validadeDias * 86400000);
  const reg = await prisma.consultaCredito.create({
    data: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      clienteId: input.clienteId ?? null,
      documento,
      tipoPessoa: tipo,
      produto: normalizado.produto,
      custoRevenda: preco,
      score: normalizado.score ?? null,
      faixa: normalizado.faixa ?? null,
      probabilidadeInadimplencia: normalizado.probabilidadeInadimplencia ?? null,
      decisao: normalizado.decisao ?? null,
      limiteRecomendado: normalizado.limiteRecomendado ?? null,
      temRestricao: normalizado.temRestricao,
      protocolo: normalizado.protocolo ?? null,
      pdfUrl: normalizado.pdfUrl ?? null,
      resultado: normalizado as unknown as object,
      bruto: bruto as object,
      validoAte,
      usuarioId: usuarioId ?? null
    }
  });
  return paraResultado(reg, false);
}

/** Crédito de estorno na carteira (consulta falhou após debitar). */
async function creditarEstorno(scope: TenantScope, valor: number, motivo: string, usuarioId?: string) {
  const carteira = await prisma.carteiraCredito.findUnique({ where: { tenantId: scope.tenantId } });
  const novo = Math.round(((Number(carteira?.saldo ?? 0)) + valor) * 100) / 100;
  await prisma.carteiraCredito.update({ where: { tenantId: scope.tenantId }, data: { saldo: novo } });
  void motivo; void usuarioId;
}

/**
 * GATE CONSULTIVO: compara o limite de crédito aprovado do cliente com os recebíveis em aberto
 * (+ o valor da venda em curso). Consultivo — só informa; quem decide bloquear é a tela/config.
 */
export async function avaliarCredito(scope: TenantScope, clienteId: string, valorAdicional = 0) {
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, ...scopedByTenantCompany(scope) }, select: { limiteCredito: true } });
  const limite = Number(cliente?.limiteCredito ?? 0);
  const agg = await prisma.contaReceber.aggregate({
    where: { clienteId, ...scopedByTenantCompany(scope), status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } },
    _sum: { valor: true, valorPago: true }
  });
  const emAberto = Math.round((Number(agg._sum.valor ?? 0) - Number(agg._sum.valorPago ?? 0)) * 100) / 100;
  const adicional = Math.round((Number(valorAdicional) || 0) * 100) / 100;
  const disponivel = Math.round((limite - emAberto) * 100) / 100;
  const temLimite = limite > 0;
  const excede = temLimite && adicional > 0 && emAberto + adicional > limite;
  return { limite, emAberto, disponivel, adicional, temLimite, excede };
}

/** Erro do gate de LIMITE — o front detecta pelo code para oferecer autorização do financeiro. */
export class LimiteCreditoExcedidoError extends Error {
  code = "LIMITE_CREDITO_EXCEDIDO" as const;
  constructor(public limite: number, public emAberto: number, public disponivel: number, public valor: number) {
    super(`Venda a prazo (R$ ${valor.toFixed(2)}) ultrapassa o limite de crédito do cliente — limite R$ ${limite.toFixed(2)}, já em aberto R$ ${emAberto.toFixed(2)}, disponível R$ ${disponivel.toFixed(2)}.`);
  }
}

/**
 * GATE de LIMITE: bloqueia venda a prazo que ultrapasse o limite de crédito (em aberto + venda >
 * limite). Cliente com limite 0 = "sem teto definido" (o controle é a liberação de venda faturada);
 * não bloqueia por limite. `autorizado` (financeiro) pula o bloqueio nesta venda.
 */
export async function assertLimiteCredito(scope: TenantScope, clienteId: string, valor: number, autorizado = false): Promise<void> {
  if (autorizado) return;
  const av = await avaliarCredito(scope, clienteId, valor);
  if (av.temLimite && av.excede) {
    throw new LimiteCreditoExcedidoError(av.limite, av.emAberto, av.disponivel, Math.round((Number(valor) || 0) * 100) / 100);
  }
}

/** Última consulta (cache OU vencida) de um cliente — para exibir no cadastro. */
export async function ultimaConsultaCliente(scope: TenantScope, clienteId: string) {
  const reg = await prisma.consultaCredito.findFirst({
    where: { clienteId, ...scopedByTenantCompany(scope) },
    orderBy: { consultadoEm: "desc" }
  });
  if (!reg) return null;
  const vigente = reg.validoAte ? reg.validoAte > new Date() : false;
  return { ...paraResultado(reg, vigente), vigente };
}
