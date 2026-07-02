import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { getSession, requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { PixError, criarPixCobranca } from "@/domains/finance/application/pix-use-cases";

/**
 * Cria uma cobrança Pix dinâmica (QR Code) — venda no caixa/PDV ou título do contas a receber.
 * Body: { contaBancariaId, valor, descricao?, pedidoVendaId?, contaReceberId? }.
 */
export async function POST(request: Request) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const session = await getSession();
    const body = (await request.json()) as {
      contaBancariaId: string;
      valor: number;
      descricao?: string | null;
      pedidoVendaId?: string | null;
      contaReceberId?: string | null;
    };
    const r = await criarPixCobranca(scope, {
      contaBancariaId: body.contaBancariaId,
      valor: Number(body.valor),
      descricao: body.descricao ?? null,
      pedidoVendaId: body.pedidoVendaId ?? null,
      contaReceberId: body.contaReceberId ?? null
    }, session?.usuarioId);
    return NextResponse.json(r);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar a cobrança Pix.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, error instanceof PixError ? 400 : 500) });
  }
}
