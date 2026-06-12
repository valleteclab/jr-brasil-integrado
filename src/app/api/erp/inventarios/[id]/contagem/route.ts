import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { countInventoryItem } from "@/domains/stock/application/inventory-use-cases";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireModulo("inventarios");
    const scope = await getDevelopmentTenantScope();
    const { id: inventarioId } = params;

    const body = (await request.json()) as {
      itemId?: string;
      saldoContado?: unknown;
    };

    const { itemId, saldoContado } = body;

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json({ error: "itemId é obrigatório." }, { status: 400 });
    }
    if (saldoContado === undefined || saldoContado === null || isNaN(Number(saldoContado))) {
      return NextResponse.json({ error: "saldoContado é obrigatório e deve ser numérico." }, { status: 400 });
    }
    if (Number(saldoContado) < 0) {
      return NextResponse.json({ error: "saldoContado não pode ser negativo." }, { status: 400 });
    }

    const item = await countInventoryItem(scope, inventarioId, itemId, Number(saldoContado));

    return NextResponse.json({ id: item.id, contado: item.contado, saldoContado: item.saldoContado });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar contagem.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}
