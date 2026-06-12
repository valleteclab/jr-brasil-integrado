import { SessionError, ForbiddenError } from "@/lib/auth/session";

/**
 * Mapeia erros de autorização para o status HTTP correto numa rota de API:
 * - SessionError   -> 401 (sem sessão / sessão expirada)
 * - ForbiddenError -> 403 (logado, mas sem módulo/perfil)
 * Para os demais erros, retorna `fallback` (padrão 500). Use no `catch` das rotas
 * para que `requireModulo`/`requireAdmin` virem 401/403 em vez de 500.
 */
export function authErrorStatus(error: unknown, fallback = 500): number {
  if (error instanceof SessionError) return 401;
  if (error instanceof ForbiddenError) return 403;
  return fallback;
}
