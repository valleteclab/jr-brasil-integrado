import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * Porta de entrada: exige presença do cookie de sessão para /erp/** e /api/erp/**.
 * A validação real (token no banco, expiração, status, permissões) é feita
 * server-side em getSession/getSessionScope. Aqui só evitamos acesso sem cookie e
 * redirecionamos para o login (páginas) ou respondemos 401 (APIs).
 *
 * Webhooks (/api/webhooks/*), MCP (/api/mcp/*) e /api/auth/* têm autenticação
 * própria e NÃO passam por aqui (ver matcher).
 */
export function middleware(request: NextRequest) {
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasCookie) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/erp/:path*", "/api/erp/:path*", "/pdv/:path*", "/admin/:path*", "/api/admin/:path*"]
};
