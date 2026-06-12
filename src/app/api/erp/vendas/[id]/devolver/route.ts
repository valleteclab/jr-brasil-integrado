import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { returnSale, type ReturnSaleInput } from "@/domains/sales/application/return-use-cases";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireModulo("vendas");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json().catch(() => ({}))) as ReturnSaleInput;
    const result = await returnSale(scope, params.id, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível registrar a devolução.";
    const isValidation =
      message.includes("não encontrado") ||
      message.includes("Somente") ||
      message.includes("Nada a devolver") ||
      message.includes("quantidade") ||
      message.includes("Quantidade") ||
      message.includes("não pertence") ||
      message.includes("não tem NF-e");
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, isValidation ? 400 : 500) });
  }
}
