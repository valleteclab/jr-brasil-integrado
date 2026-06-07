import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { previewSaleInvoice } from "@/domains/sales/application/sale-use-cases";

// Espelho fiscal de um pedido de venda: prévia dos tributos da NF-e/NFC-e antes de emitir.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as { modelo?: "NFE" | "NFCE" };
    const preview = await previewSaleInvoice(scope, params.id, { modelo: body.modelo });
    return NextResponse.json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao calcular o espelho fiscal.";
    const isValidation = message.includes("não encontrado") || message.includes("sem itens");
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}
