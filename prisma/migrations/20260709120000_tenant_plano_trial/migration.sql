-- Plano comercial (COMPLETO | EMISSOR) + trial por tenant.
ALTER TABLE "Tenant" ADD COLUMN "plano" TEXT NOT NULL DEFAULT 'COMPLETO';
ALTER TABLE "Tenant" ADD COLUMN "trialFimEm" TIMESTAMP(3);
