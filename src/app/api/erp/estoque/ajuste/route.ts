import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { adjustStock } from "@/domains/stock/application/stock-adjust-use-cases";

export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as {
      produtoId?: string;
      depositoId?: string;
      novaQuantidade?: unknown;
      motivo?: string;
    };

    const { produtoId, depositoId, novaQuantidade, motivo } = body;

    if (!produtoId || typeof produtoId !== "string") {
      return NextResponse.json({ error: "produtoId é obrigatório." }, { status: 400 });
    }
    if (novaQuantidade === undefined || novaQuantidade === null || isNaN(Number(novaQuantidade))) {
      return NextResponse.json({ error: "novaQuantidade é obrigatória e deve ser numérica." }, { status: 400 });
    }
    if (!motivo || typeof motivo !== "string" || motivo.trim().length < 3) {
      return NextResponse.json({ error: "motivo é obrigatório (mínimo 3 caracteres)." }, { status: 400 });
    }

    const resultado = await adjustStock(scope, {
      produtoId,
      depositoId: depositoId ?? undefined,
      novaQuantidade: Number(novaQuantidade),
      motivo: motivo.trim()
    });

    return NextResponse.json(resultado);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao ajustar estoque.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
