import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash de senha com scrypt (node:crypto) — formato "salt:hash" em hex.
 * Mesmo esquema já usado no cadastro de colaboradores; centralizado para reuso
 * no login. Sem dependências externas.
 */
export function hashPassword(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/** Verifica a senha contra o hash armazenado, em tempo constante. */
export function verifyPassword(senha: string, stored: string): boolean {
  const [salt, key] = (stored ?? "").split(":");
  if (!salt || !key) return false;
  const hashed = scryptSync(senha, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  if (keyBuf.length !== hashed.length) return false;
  return timingSafeEqual(keyBuf, hashed);
}
