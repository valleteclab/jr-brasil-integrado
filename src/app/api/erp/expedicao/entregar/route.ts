import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { confirmarEntregaRetirada, ExpedicaoError } from "@/domains/sales/application/expedicao-use-cases";

// Baixa da retirada na expedição: confere o código e confirma a entrega (total ou
// parcial — `itens` informa quanto de cada produto está saindo agora).
export async function POST(request: Request) {
  try {
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as {
      codigo?: string;
      conferente?: string;
      observacoes?: string;
      itens?: Array<{ produtoId: string; quantidade: number }>;
    };
    const { retirada, completo } = await confirmarEntregaRetirada(scope, body.codigo ?? "", {
      conferente: body.conferente ?? "",
      observacoes: body.observacoes,
      itens: body.itens
    });
    return NextResponse.json({
      id: retirada.id,
      status: retirada.status,
      completo,
      entregueEm: retirada.entregueEm?.toISOString() ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao confirmar a entrega.";
    return NextResponse.json({ error: message }, { status: error instanceof ExpedicaoError ? 400 : 500 });
  }
}
