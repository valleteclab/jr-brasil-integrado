/**
 * Gerencia o DONO DA PLATAFORMA (super administrador global do SaaS), uma conta
 * SEPARADA, sem vínculo a nenhum cliente, que acessa apenas o painel /admin.
 *
 * - Se o e-mail já existe: marca/desmarca como dono da plataforma.
 * - Se não existe: cria a conta (sem vínculo a cliente) com a senha informada.
 *
 * Uso:
 *   npx tsx scripts/conceder-admin-plataforma.ts <email> [senha]   # concede/cria
 *   npx tsx scripts/conceder-admin-plataforma.ts <email> --revogar # revoga
 *
 * Requer DATABASE_URL no ambiente (mesmo banco da aplicação).
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

// Hash scrypt no MESMO formato de src/lib/security/password.ts ("salt:hash").
function hashPassword(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const revogar = process.argv.includes("--revogar");
  const senhaArg = process.argv.slice(3).find((a) => !a.startsWith("--"));

  if (!email) {
    console.error("Uso: npx tsx scripts/conceder-admin-plataforma.ts <email> [senha] [--revogar]");
    process.exit(1);
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (revogar) {
    if (!usuario) {
      console.error(`Usuário não encontrado: ${email}`);
      process.exit(1);
    }
    await prisma.usuario.update({ where: { id: usuario.id }, data: { plataformaAdmin: false } });
    console.log(`\n✅ Acesso de dono da plataforma REVOGADO de ${email}.`);
    return;
  }

  if (usuario) {
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { plataformaAdmin: true, ...(senhaArg ? { senhaHash: hashPassword(senhaArg), status: "ATIVO" } : {}) }
    });
    const aviso = usuario.plataformaAdmin ? "(já era dono da plataforma)" : "";
    console.log(`\n✅ Acesso de dono da plataforma CONCEDIDO a ${email}. ${aviso}`.trimEnd());
    console.log("Acesse /admin. (Esta conta NÃO é admin de nenhum cliente.)");
    return;
  }

  // Conta nova: dono da plataforma separado, sem vínculo a cliente.
  const senha = senhaArg ?? "";
  if (senha.length < 8) {
    console.error(`Usuário ${email} não existe. Informe uma senha (>= 8 caracteres) para criar a conta:`);
    console.error(`  npx tsx scripts/conceder-admin-plataforma.ts ${email} <senha>`);
    process.exit(1);
  }
  await prisma.usuario.create({
    data: { nome: "Dono da Plataforma", email, senhaHash: hashPassword(senha), status: "ATIVO", plataformaAdmin: true }
  });
  console.log(`\n✅ Conta de dono da plataforma CRIADA: ${email}`);
  console.log("Sem vínculo a nenhum cliente. Faça login e acesse /admin.");
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
