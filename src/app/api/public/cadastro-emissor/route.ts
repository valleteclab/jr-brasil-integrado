import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { criarClienteCore, PlatformAdminError } from "@/lib/services/platform-admin";

/**
 * CADASTRO PÚBLICO do plano EMISSOR DE NOTAS (self-service): cria tenant já no plano Emissor com
 * o trial definido em /admin/planos. Sem sessão — validações fortes + honeypot anti-bot.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      empresa?: string; cnpj?: string; nome?: string; email?: string; senha?: string; whatsapp?: string;
      site?: string; // honeypot — humano deixa vazio
    };
    if (body.site) return NextResponse.json({ ok: true }); // bot: finge sucesso
    const cnpj = (body.cnpj ?? "").replace(/\D/g, "");
    const empresa = (body.empresa ?? "").trim();
    const nome = (body.nome ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const senha = (body.senha ?? "").trim();
    if (!empresa || !nome || !email) return NextResponse.json({ error: "Preencha empresa, seu nome e e-mail." }, { status: 400 });
    if (cnpj.length !== 14) return NextResponse.json({ error: "Informe um CNPJ válido (14 dígitos)." }, { status: 400 });
    if (senha.length < 8) return NextResponse.json({ error: "A senha precisa de pelo menos 8 caracteres." }, { status: 400 });
    if (await prisma.empresa.findFirst({ where: { cnpj }, select: { id: true } })) {
      return NextResponse.json({ error: "Este CNPJ já está cadastrado — faça login ou fale com o suporte." }, { status: 400 });
    }

    const plano = await prisma.plataformaPlano.findUnique({ where: { codigo: "EMISSOR" } });
    if (!plano?.ativo) return NextResponse.json({ error: "Cadastro indisponível no momento — fale com o suporte." }, { status: 400 });

    const r = await criarClienteCore(
      { nomeCliente: empresa, razaoSocial: empresa, cnpj, adminNome: nome, adminEmail: email, senhaInicial: senha },
      { plano: "EMISSOR", trialDias: plano.trialDias }
    );
    return NextResponse.json({ ok: true, trialDias: plano.trialDias, email: r.adminEmail });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Não foi possível concluir o cadastro.";
    return NextResponse.json({ error: msg }, { status: error instanceof PlatformAdminError ? 400 : 500 });
  }
}
