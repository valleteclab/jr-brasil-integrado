/**
 * Concede (ou revoga) acesso de DONO DA PLATAFORMA a um usuário pelo e-mail.
 * Dono da plataforma = super administrador global do SaaS, com acesso ao painel
 * /admin para liberar/bloquear clientes, criar novos clientes, resetar senhas e
 * monitorar emissões fiscais. É um nível acima do perfil SUPER_ADMIN (que é por tenant).
 *
 * Uso:
 *   npx tsx scripts/conceder-admin-plataforma.ts <email>            # concede
 *   npx tsx scripts/conceder-admin-plataforma.ts <email> --revogar  # revoga
 *
 * Requer DATABASE_URL no ambiente (mesmo banco da aplicação).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const revogar = process.argv.includes("--revogar");

  if (!email) {
    console.error("Uso: npx tsx scripts/conceder-admin-plataforma.ts <email> [--revogar]");
    process.exit(1);
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) {
    console.error(`Usuário não encontrado: ${email}`);
    process.exit(1);
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { plataformaAdmin: !revogar }
  });

  console.log(
    revogar
      ? `\n✅ Acesso de dono da plataforma REVOGADO de ${email}.`
      : `\n✅ Acesso de dono da plataforma CONCEDIDO a ${email}. Acesse /admin.`
  );
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
