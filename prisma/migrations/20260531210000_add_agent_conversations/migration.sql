-- Agente de IA: conversas e mensagens (tool-calling), por tenant/empresa.
CREATE TYPE "AgentRole" AS ENUM ('GESTOR', 'VENDEDOR', 'CLIENTE');
CREATE TYPE "MensagemPapel" AS ENUM ('USER', 'ASSISTANT', 'TOOL', 'SYSTEM');

CREATE TABLE "ConversaAgente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "role" "AgentRole" NOT NULL,
    "titulo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConversaAgente_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConversaAgente_tenantId_empresaId_idx" ON "ConversaAgente"("tenantId", "empresaId");

CREATE TABLE "MensagemAgente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "papel" "MensagemPapel" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "toolName" TEXT,
    "toolPayload" JSONB,
    "draftTipo" TEXT,
    "draftId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MensagemAgente_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MensagemAgente_tenantId_empresaId_conversaId_idx" ON "MensagemAgente"("tenantId", "empresaId", "conversaId");

ALTER TABLE "ConversaAgente" ADD CONSTRAINT "ConversaAgente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversaAgente" ADD CONSTRAINT "ConversaAgente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MensagemAgente" ADD CONSTRAINT "MensagemAgente_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ConversaAgente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
