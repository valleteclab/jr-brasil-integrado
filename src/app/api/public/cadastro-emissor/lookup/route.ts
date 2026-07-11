import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { lookupCnpj, CadastroLookupError } from "@/lib/lookup/cadastro-lookup";
import { isValidCnpj, normalizeDocumento } from "@/lib/fiscal/documento";

/**
 * LOOKUP PÚBLICO de CNPJ do cadastro do Emissor (passo 1 do /cadastro): busca os dados na
 * Receita (BrasilAPI/minhareceita) para autopreencher a conta. Sem sessão — honeypot anti-bot
 * e resposta mínima. Também avisa se o CNPJ já tem conta (evita o cliente preencher tudo à toa).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { cnpj?: string; site?: string };
    if (body.site) return NextResponse.json({ error: "CNPJ não encontrado." }, { status: 404 }); // bot
    const cnpj = normalizeDocumento(body.cnpj);
    if (!isValidCnpj(cnpj)) return NextResponse.json({ error: "Informe um CNPJ válido (14 caracteres)." }, { status: 400 });

    if (await prisma.empresa.findFirst({ where: { cnpj }, select: { id: true } })) {
      return NextResponse.json({ jaCadastrado: true });
    }

    const dados = await lookupCnpj(cnpj);
    return NextResponse.json({ jaCadastrado: false, dados });
  } catch (error) {
    if (error instanceof CadastroLookupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Não foi possível consultar o CNPJ agora." }, { status: 500 });
  }
}
