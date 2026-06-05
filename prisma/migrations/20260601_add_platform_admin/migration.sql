-- Painel da plataforma (dono do SaaS): marca usuários com acesso de super administrador
-- global, acima do tenant. Diferente do perfil SUPER_ADMIN, que é por tenant.
ALTER TABLE "Usuario" ADD COLUMN "plataformaAdmin" BOOLEAN NOT NULL DEFAULT false;
