-- Fase 3: WhatsApp (Z-API). Identidade por telefone (mapa telefone→empresa→papel),
-- config de credenciais Z-API por empresa, e canal/telefone nas conversas do agente.
CREATE TYPE "ProvedorWhatsapp" AS ENUM ('ZAPI');

ALTER TABLE "ConversaAgente" ADD COLUMN "canal" TEXT NOT NULL DEFAULT 'WEB';
ALTER TABLE "ConversaAgente" ADD COLUMN "telefone" TEXT;

CREATE TABLE "AgenteTelefone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT,
    "role" "AgentRole" NOT NULL DEFAULT 'VENDEDOR',
    "clienteId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgenteTelefone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgenteTelefone_telefone_key" ON "AgenteTelefone"("telefone");
CREATE INDEX "AgenteTelefone_tenantId_empresaId_idx" ON "AgenteTelefone"("tenantId", "empresaId");

CREATE TABLE "ConfiguracaoWhatsapp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provedor" "ProvedorWhatsapp" NOT NULL DEFAULT 'ZAPI',
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "instanceId" TEXT,
    "tokenCripto" TEXT,
    "clientTokenCripto" TEXT,
    "webhookSecret" TEXT,
    "atenderClientes" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConfiguracaoWhatsapp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConfiguracaoWhatsapp_empresaId_key" ON "ConfiguracaoWhatsapp"("empresaId");
CREATE INDEX "ConfiguracaoWhatsapp_tenantId_empresaId_idx" ON "ConfiguracaoWhatsapp"("tenantId", "empresaId");

ALTER TABLE "AgenteTelefone" ADD CONSTRAINT "AgenteTelefone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgenteTelefone" ADD CONSTRAINT "AgenteTelefone_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConfiguracaoWhatsapp" ADD CONSTRAINT "ConfiguracaoWhatsapp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConfiguracaoWhatsapp" ADD CONSTRAINT "ConfiguracaoWhatsapp_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
