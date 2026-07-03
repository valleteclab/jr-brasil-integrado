import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { authDaConta, contaTemCobranca, BoletoError } from "@/domains/finance/application/boleto-use-cases";
import { consultarSaldo } from "@/domains/finance/providers/sicoob-conta";

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
    const body = (await request.json()) as { empresa?: string; conta?: string; contaCorrente?: string };
    const cnpj = (body.empresa ?? "").replace(/\D+/g, "");
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
