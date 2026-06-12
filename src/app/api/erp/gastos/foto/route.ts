import { NextResponse } from "next/server";
import { getDevelopmentTenantScope } from "@/lib/auth/dev-session";
import { requireModulo } from "@/lib/auth/session";
import { authErrorStatus } from "@/lib/auth/http";
import { criarGastoDeCupom } from "@/domains/expenses/application/gasto-use-cases";

export const dynamic = "force-dynamic";

// Recebe a foto do cupom (data URL base64), a IA lê e cria o gasto (status PENDENTE para revisão).
export async function POST(request: Request) {
  try {
    await requireModulo("gastos");
    const scope = await getDevelopmentTenantScope();
    const body = (await request.json()) as { imagem?: string };
    if (!body.imagem || !body.imagem.startsWith("data:image")) {
      return NextResponse.json({ error: "Envie a imagem do cupom (foto)." }, { status: 400 });
    }
    const result = await criarGastoDeCupom(scope, { imagem: body.imagem, origem: "PWA" });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao ler o cupom.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error) });
  }
}
