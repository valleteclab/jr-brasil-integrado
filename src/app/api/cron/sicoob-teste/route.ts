import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { authDaConta, contaTemCobranca, BoletoError } from "@/domains/finance/application/boleto-use-cases";
import { consultarSaldo } from "@/domains/finance/providers/sicoob-conta";
import { testarTokenSicoob } from "@/domains/finance/providers/sicoob-http";
import { normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * Rota de DIAGNÓSTICO (CRON_SECRET, como os crons): testa a autenticação Sicoob de PRODUÇÃO
 * ponta a ponta — gera o access token (client_credentials + mTLS com o A1) e consulta o SALDO da
 * conta corrente. Body: { empresa: <cnpj|nome>, conta?: <nome da conta>, contaCorrente?: "2681269" }.
 * Não altera nada no cadastro.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("x-cron-secret")?.trim() === secret;
}

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const body = (await request.json()) as { empresa?: string; conta?: string; contaCorrente?: string; testarEscopos?: string[]; consultarBoleto?: string };
    const cnpj = normalizeDocumento(body.empresa);
    const empresa = await prisma.empresa.findFirst({
      where: cnpj.length === 14 ? { cnpj } : { razaoSocial: { contains: body.empresa ?? "", mode: "insensitive" } }
    });
    if (!empresa) throw new BoletoError(`Empresa não encontrada: ${body.empresa}`);
    const scope = { tenantId: empresa.tenantId, empresaId: empresa.id } as TenantScope;

    const conta = await prisma.contaBancaria.findFirst({
      where: {
        tenantId: empresa.tenantId,
        empresaId: empresa.id,
        sicoobClientId: { not: null },
        ...(body.conta ? { nome: { contains: body.conta, mode: "insensitive" } } : {})
      }
    });
    if (!conta) throw new BoletoError("Nenhuma conta bancária com credenciamento Sicoob encontrada.");
    if (!contaTemCobranca(conta)) throw new BoletoError(`A conta "${conta.nome}" não tem o credenciamento Sicoob completo.`);

    const numeroConta = (body.contaCorrente ?? conta.sicoobContaCorrente ?? "").replace(/\D+/g, "");
    if (!numeroConta) throw new BoletoError("Informe contaCorrente no body ou preencha o campo na conta.");

    const auth = await authDaConta(scope, conta);

    // PROBE de método HTTP no endpoint de BAIXA (diagnóstico do 405): pedido + método a testar.
    const bodyProbe = body as { probeBaixaPedido?: string; metodo?: string };
    if (bodyProbe.probeBaixaPedido) {
      const pedido = await prisma.pedidoVenda.findFirst({
        where: { tenantId: empresa.tenantId, empresaId: empresa.id, numero: bodyProbe.probeBaixaPedido },
        select: { id: true }
      });
      if (!pedido) throw new BoletoError(`Pedido ${bodyProbe.probeBaixaPedido} não encontrado.`);
      const boletoDb = await prisma.boletoCobranca.findFirst({
        where: { tenantId: empresa.tenantId, empresaId: empresa.id, contaReceber: { pedidoVendaId: pedido.id } },
        select: { nossoNumero: true, status: true }
      });
      if (!boletoDb?.nossoNumero) throw new BoletoError("Boleto do pedido sem nossoNumero.");
      const { chamadaCobrancaCrua } = await import("@/domains/finance/providers/sicoob-cobranca");
      const metodo = (bodyProbe.metodo ?? "POST").toUpperCase();
      const r = await chamadaCobrancaCrua(auth, metodo, `/boletos/${boletoDb.nossoNumero}/baixar`, {
        numeroCliente: conta.sicoobNumeroCliente as number,
        codigoModalidade: conta.sicoobModalidade
      });
      return NextResponse.json({ metodo, nossoNumero: boletoDb.nossoNumero, statusBoletoDb: boletoDb.status, statusCode: r.statusCode, corpo: r.body.slice(0, 500) });
    }

    // Reproduz a consulta do "Consultar pgto": GET do boleto pelo nosso número (resposta bruta).
    if (body.consultarBoleto) {
      const { consultarBoleto } = await import("@/domains/finance/providers/sicoob-cobranca");
      const r = await consultarBoleto(auth, {
        numeroCliente: conta.sicoobNumeroCliente as number,
        codigoModalidade: conta.sicoobModalidade,
        nossoNumero: body.consultarBoleto
      });
      return NextResponse.json({ situacao: r.situacao, valorPago: r.valorPago, dataPagamento: r.dataPagamento, bruto: r.bruto });
    }

    // BISSECÇÃO de escopos: testa cada conjunto informado e devolve quais o credenciamento aceita.
    if (body.testarEscopos?.length) {
      const resultados: Record<string, string> = {};
      for (const s of body.testarEscopos.slice(0, 12)) {
        const r = await testarTokenSicoob(auth, s);
        resultados[s] = r.ok ? "OK" : (r.erro ?? "erro").slice(0, 160);
      }
      return NextResponse.json({ conta: conta.nome, escopos: resultados });
    }
    const saldo = await consultarSaldo(auth, numeroConta);
    return NextResponse.json({
      conta: conta.nome,
      ambiente: auth.sandbox ? "SANDBOX" : "PRODUCAO",
      clientId: (conta.sicoobClientId ?? "").slice(0, 8) + "...",
      contaCorrente: numeroConta,
      tokenOk: true,
      saldo: saldo.saldo,
      saldoLimite: saldo.saldoLimite,
      saldoBloqueado: saldo.saldoBloqueado
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no teste Sicoob.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
