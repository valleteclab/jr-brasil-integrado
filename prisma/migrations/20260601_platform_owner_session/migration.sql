-- Conta do dono da plataforma 100% separada: a sessão dele não tem tenant/empresa.
-- Torna o escopo da sessão opcional para permitir login sem vínculo a um cliente.
ALTER TABLE "Sessao" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "Sessao" ALTER COLUMN "empresaId" DROP NOT NULL;
