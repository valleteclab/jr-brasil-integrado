/**
 * Reseta a senha de um usuário gerando o hash no formato correto (scrypt "salt:hash"),
 * o mesmo que o login espera. Use quando a senha foi gravada manualmente em texto puro.
 *
 * Uso:
 *   npx tsx scripts/reset-senha.ts <email> <novaSenha>
 *   # ou por variáveis de ambiente:
 *   RESET_EMAIL=admin@jrbrasilpecas.com.br RESET_SENHA='MinhaSenha@123' npx tsx scripts/reset-senha.ts
 *
 * Requer DATABASE_URL no ambiente (mesmo banco da aplicação).
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const email = (process.argv[2] ?? process.env.RESET_EMAIL ?? "").trim().toLowerCase();
  const senha = process.argv[3] ?? process.env.RESET_SENHA ?? "";

  if (!email || !senha) {
    console.error("Uso: npx tsx scripts/reset-senha.ts <email> <novaSenha>");
    process.exit(1);
  }
  if (senha.length < 8) {
    console.error("A senha deve ter ao menos 8 caracteres.");
    process.exit(1);
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) {
    console.error(`Usuário não encontrado: ${email}`);
    process.exit(1);
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: hashPassword(senha), status: "ATIVO" }
  });

  // Confere se há vínculo ativo (sem ele o login dá 403, não 401).
  const vinculo = await prisma.usuarioVinculo.findFirst({ where: { usuarioId: usuario.id, ativo: true } });

  console.log(`\n✅ Senha redefinida para ${email}.`);
  console.log(vinculo
    ? "Vínculo ativo encontrado — já pode fazer login."
    : "⚠️ Atenção: usuário SEM vínculo ativo (empresa/perfil). Rode o seed ou crie o vínculo, senão o login retorna 403.");
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
