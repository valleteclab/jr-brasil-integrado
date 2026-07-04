import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/security/password";
import { createSession } from "@/lib/auth/session";
import type { TenantScope } from "@/lib/auth/dev-session";
import { TwoFactorError, iniciarDesafio2fa, mascararWhatsapp } from "@/lib/auth/two-factor";

/**
 * Login: valida e-mail/senha com PROTEÇÃO CONTRA FORÇA BRUTA (5 falhas seguidas → bloqueio de
 * 15 min) e, quando a empresa exige 2FA (toggle do dono do SaaS no /admin), envia o código por
 * WhatsApp e devolve o desafio — a sessão só abre depois do código conferido em /login/2fa.
 */

const MAX_FALHAS = 5;
const BLOQUEIO_MIN = 15;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; senha?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const senha = body.senha ?? "";
    if (!email || !senha) {
      return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
    }

    const usuario = await prisma.usuario.findUnique({ where: { email } });
    // Mensagem genérica para não revelar se o e-mail existe.
    const invalido = NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    if (!usuario || usuario.status !== "ATIVO") return invalido;

    // Bloqueio temporário por força bruta.
    if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
      const minutos = Math.max(1, Math.ceil((usuario.bloqueadoAte.getTime() - Date.now()) / 60000));
      return NextResponse.json(
        { error: `Muitas tentativas de login. Aguarde ${minutos} minuto(s) e tente novamente.` },
        { status: 429 }
      );
    }

    if (!verifyPassword(senha, usuario.senhaHash)) {
      const falhas = usuario.loginFalhas + 1;
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: falhas >= MAX_FALHAS
          ? { loginFalhas: 0, bloqueadoAte: new Date(Date.now() + BLOQUEIO_MIN * 60 * 1000) }
          : { loginFalhas: falhas }
      });
      return invalido;
    }

    // Senha correta: zera o contador de falhas.
    if (usuario.loginFalhas > 0 || usuario.bloqueadoAte) {
      await prisma.usuario.update({ where: { id: usuario.id }, data: { loginFalhas: 0, bloqueadoAte: null } });
    }

    const vinculo = await prisma.usuarioVinculo.findFirst({
      where: { usuarioId: usuario.id, ativo: true },
      orderBy: { criadoEm: "asc" }
    });

    // Dono da plataforma sem vínculo a cliente: abre uma sessão de plataforma (sem
    // escopo) e vai direto ao painel /admin. Não pertence a nenhum ERP de cliente.
    if (!vinculo || !vinculo.empresaId) {
      if (usuario.plataformaAdmin) {
        await createSession(usuario.id, null, request.headers.get("user-agent"));
        await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcessoEm: new Date() } });
        return NextResponse.json({ ok: true, redirect: "/admin" });
      }
      return NextResponse.json({ error: "Usuário sem empresa/perfil ativo. Procure o administrador." }, { status: 403 });
    }

    // Enforcement de bloqueio do cliente: tenant inativo ou empresa não-ATIVA impedem o
    // login (exceto o dono da plataforma, que administra os bloqueios). Espelha getSession.
    const [tenant, empresa] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: vinculo.tenantId }, select: { ativo: true } }),
      prisma.empresa.findUnique({ where: { id: vinculo.empresaId }, select: { status: true, exigir2fa: true } })
    ]);
    if (!usuario.plataformaAdmin) {
      if (!tenant?.ativo || !empresa || empresa.status !== "ATIVA") {
        return NextResponse.json(
          { error: "Acesso suspenso. Procure o suporte da plataforma." },
          { status: 403 }
        );
      }
    }

    // 2FA da empresa: código por WhatsApp ANTES de abrir a sessão.
    if (empresa?.exigir2fa && !usuario.plataformaAdmin) {
      if (!usuario.whatsapp?.trim()) {
        return NextResponse.json(
          { error: "Esta empresa exige verificação em duas etapas e seu usuário não tem WhatsApp cadastrado. Peça ao administrador da plataforma." },
          { status: 403 }
        );
      }
      const scope = { tenantId: vinculo.tenantId, empresaId: vinculo.empresaId } as TenantScope;
      const { desafioId } = await iniciarDesafio2fa(
        { id: usuario.id, nome: usuario.nome, whatsapp: usuario.whatsapp },
        scope
      );
      return NextResponse.json({ twofa: true, desafioId, whatsappMascarado: mascararWhatsapp(usuario.whatsapp) });
    }

    await createSession(
      usuario.id,
      { tenantId: vinculo.tenantId, empresaId: vinculo.empresaId },
      request.headers.get("user-agent")
    );
    await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcessoEm: new Date() } });

    return NextResponse.json({ ok: true, redirect: "/erp" });
  } catch (error) {
    if (error instanceof TwoFactorError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Erro ao autenticar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
