import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { invoiceSale } from "@/domains/sales/application/sale-use-cases";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = await request.json().catch(() => ({})) as { modelo?: "NFE" | "NFCE" };
    const nota = await invoiceSale(scope, params.id, { modelo: body.modelo });
    return NextResponse.json({ notaFiscalId: nota.id, status: nota.status, numero: nota.numero });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao faturar venda.";
    const isValidation =
      message.includes("não encontrado") ||
      message.includes("Somente") ||
      message.includes("Confirme") ||
      message.includes("incompleto") ||
      message.includes("consumidor anônimo");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}
