-- Módulo Loja Virtual liberado pelo dono do SaaS (por cliente/tenant).
ALTER TABLE "Tenant" ADD COLUMN "lojaHabilitada" BOOLEAN NOT NULL DEFAULT false;
