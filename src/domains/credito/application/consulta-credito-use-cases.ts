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
  const preco = Number(tipo === "PF" ? cfg.precoConsultaPF : cfg.precoConsultaPJ);
  const validadeDias = cfg.validadeConsultaDias ?? 60;

  const rt = await getApiBrasilRuntime();
  if (!rt) throw new CreditoError("Bureau (ApiBrasil) não configurado pela plataforma.");

  // 2) Debita ANTES de chamar (garante saldo); se a chamada falhar, estorna.
  await debitarCarteira(scope, preco, `Consulta de crédito ${tipo} ${documento}`, usuarioId);
  let bruto: unknown;
  try {
    const resp = await consultarCreditoApiBrasil(rt, tipo, documento);
    if (!resp.ok) throw new CreditoError(`Bureau retornou erro (HTTP ${resp.status}).`);
    bruto = resp.body;
  } catch (e) {
    // Estorna o débito quando a consulta não completa (o cliente não pode pagar por consulta falha).
    await creditarEstorno(scope, preco, `Estorno — consulta ${tipo} ${documento} falhou`, usuarioId);
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
