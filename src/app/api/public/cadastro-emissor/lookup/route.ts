import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { lookupCnpj, CadastroLookupError } from "@/lib/lookup/cadastro-lookup";
import { isValidCnpj, normalizeDocumento } from "@/lib/fiscal/documento";
import { canRepeatCnpjForChatTest, type SelfServicePlan } from "@/lib/auth/self-service-registration";

/**
 * LOOKUP PÚBLICO de CNPJ do cadastro do Emissor (passo 1 do /cadastro): busca os dados na
 * Receita (BrasilAPI/minhareceita) para autopreencher a conta. Sem sessão — honeypot anti-bot
 * e resposta mínima. Também avisa se o CNPJ já tem conta (evita o cliente preencher tudo à toa).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { cnpj?: string; site?: string; plano?: string };
    if (body.site) return NextResponse.json({ error: "CNPJ não encontrado." }, { status: 404 }); // bot
    const cnpj = normalizeDocumento(body.cnpj);
    const plano: SelfServicePlan = body.plano === "CHAT" ? "CHAT" : "EMISSOR";
    if (!isValidCnpj(cnpj)) return NextResponse.json({ error: "Informe um CNPJ válido (14 caracteres)." }, { status: 400 });

    const jaCadastrado = Boolean(await prisma.empresa.findFirst({ where: { cnpj }, select: { id: true } }));
    const cadastroTeste = jaCadastrado && canRepeatCnpjForChatTest(cnpj, plano);
    if (jaCadastrado && !cadastroTeste) {
      return NextResponse.json({ jaCadastrado: true });
    }

    const dados = await lookupCnpj(cnpj);
    return NextResponse.json({ jaCadastrado: false, cadastroTeste, dados });
  } catch (error) {
    if (error instanceof CadastroLookupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Não foi possível consultar o CNPJ agora." }, { status: 500 });
  }
}
