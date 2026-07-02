import { NextResponse } from "next/server";
import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";

/**
 * Boletos das parcelas de um pedido de venda (para imprimir direto da tela de vendas/atendimento,
 * sem passar pelo financeiro). Inclui parcelas ainda sem boleto (para orientar o "Gerar boleto").
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const parcelas = await prisma.contaReceber.findMany({
      where: { ...scopedByTenantCompany(scope), pedidoVendaId: params.id },
      orderBy: { vencimento: "asc" },
      select: {
        id: true,
        descricao: true,
        vencimento: true,
        valor: true,
        status: true,
        boleto: { select: { status: true, linhaDigitavel: true, pdfBase64: true } }
      }
    });
    return NextResponse.json({
      boletos: parcelas.map((p) => ({
        contaReceberId: p.id,
        descricao: p.descricao,
        vencimento: p.vencimento.toISOString(),
        valor: Number(p.valor),
        statusConta: p.status,
        boletoStatus: p.boleto?.status ?? null,
        linhaDigitavel: p.boleto?.linhaDigitavel ?? null,
        temPdf: Boolean(p.boleto?.pdfBase64)
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao listar os boletos do pedido.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 500) });
  }
}
