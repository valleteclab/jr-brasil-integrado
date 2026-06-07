-- Módulo de IA por cliente (liberado pelo dono do SaaS). Ligado por padrão.
ALTER TABLE "Tenant" ADD COLUMN "iaHabilitada" BOOLEAN NOT NULL DEFAULT true;
