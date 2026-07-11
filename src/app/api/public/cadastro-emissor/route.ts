import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { criarClienteCore, PlatformAdminError, type EmpresaDadosExtra } from "@/lib/services/platform-admin";
import { isValidCnpj, normalizeDocumento } from "@/lib/fiscal/documento";

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
      /** Dados do lookup de CNPJ (passo 1 do cadastro) — reaproveitados na Empresa criada. */
      empresaDados?: EmpresaDadosExtra & { nomeFantasia?: string | null };
    };
    if (body.site) return NextResponse.json({ ok: true }); // bot: finge sucesso
    const cnpj = normalizeDocumento(body.cnpj);
    const empresa = (body.empresa ?? "").trim();
    const nome = (body.nome ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const senha = (body.senha ?? "").trim();
    if (!empresa || !nome || !email) return NextResponse.json({ error: "Preencha empresa, seu nome e e-mail." }, { status: 400 });
    if (!isValidCnpj(cnpj)) return NextResponse.json({ error: "Informe um CNPJ válido (14 caracteres)." }, { status: 400 });
    if (senha.length < 8) return NextResponse.json({ error: "A senha precisa de pelo menos 8 caracteres." }, { status: 400 });
    if (await prisma.empresa.findFirst({ where: { cnpj }, select: { id: true } })) {
      return NextResponse.json({ error: "Este CNPJ já está cadastrado — faça login ou fale com o suporte." }, { status: 400 });
    }

    const plano = await prisma.plataformaPlano.findUnique({ where: { codigo: "EMISSOR" } });
    if (!plano?.ativo) return NextResponse.json({ error: "Cadastro indisponível no momento — fale com o suporte." }, { status: 400 });

    // Sanitiza os dados extras vindos do navegador (só os campos conhecidos, regime whitelist).
    const ed = body.empresaDados ?? {};
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
    const empresaDados: EmpresaDadosExtra = {
      inscricaoEstadual: str(ed.inscricaoEstadual),
      inscricaoMunicipal: str(ed.inscricaoMunicipal),
      regimeTributario: ed.regimeTributario === "MEI" || ed.regimeTributario === "SIMPLES_NACIONAL" ? ed.regimeTributario : null,
      telefone: str(ed.telefone),
      email: str(ed.email),
      enderecoLogradouro: str(ed.enderecoLogradouro),
      enderecoNumero: str(ed.enderecoNumero),
      enderecoComplemento: str(ed.enderecoComplemento),
      enderecoBairro: str(ed.enderecoBairro),
      enderecoCidade: str(ed.enderecoCidade),
      enderecoUf: str(ed.enderecoUf)?.toUpperCase()?.slice(0, 2) ?? null,
      enderecoCep: str(ed.enderecoCep)?.replace(/\D/g, "").slice(0, 8) ?? null,
      codigoMunicipioIbge: str(ed.codigoMunicipioIbge)?.replace(/\D/g, "").slice(0, 7) ?? null
    };

    const r = await criarClienteCore(
      {
        nomeCliente: empresa,
        razaoSocial: empresa,
        nomeFantasia: str(ed.nomeFantasia) ?? undefined,
        cnpj,
        adminNome: nome,
        adminEmail: email,
        senhaInicial: senha
      },
      { plano: "EMISSOR", trialDias: plano.trialDias, empresaDados }
    );
    return NextResponse.json({ ok: true, trialDias: plano.trialDias, email: r.adminEmail });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Não foi possível concluir o cadastro.";
    return NextResponse.json({ error: msg }, { status: error instanceof PlatformAdminError ? 400 : 500 });
  }
}
