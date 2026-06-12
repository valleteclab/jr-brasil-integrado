-- Módulos liberáveis pelo dono do SaaS, por tenant. LIGADOS por padrão (true) para preservar o
-- acesso atual dos clientes existentes — o dono do SaaS desliga o que cada cliente não contrata.
ALTER TABLE "Tenant" ADD COLUMN "pdvTelaCheiaHabilitado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "vendaBalcaoHabilitada" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "pedidoFaturadoHabilitado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "ordemServicoHabilitada" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "orcamentoHabilitado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "financeiroHabilitado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "fiscalHabilitado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "gastosHabilitado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "cosmosHabilitado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "whatsappHabilitado" BOOLEAN NOT NULL DEFAULT true;
