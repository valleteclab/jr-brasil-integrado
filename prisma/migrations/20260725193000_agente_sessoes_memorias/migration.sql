-- Sessões explícitas e memórias autorizadas do agente.
CREATE TYPE "ConversaAgenteStatus" AS ENUM ('ATIVA', 'ENCERRADA');

ALTER TABLE "ConversaAgente"
  ADD COLUMN "status" "ConversaAgenteStatus" NOT NULL DEFAULT 'ATIVA',
  ADD COLUMN "resumo" TEXT,
  ADD COLUMN "encerradaEm" TIMESTAMP(3),
  ADD COLUMN "motivoEncerramento" TEXT;

-- Conversas anteriores permanecem para auditoria, mas nenhuma é presumida ativa
-- depois da introdução do ciclo explícito de sessão.
UPDATE "ConversaAgente"
SET
  "status" = 'ENCERRADA',
  "encerradaEm" = COALESCE("atualizadoEm", CURRENT_TIMESTAMP),
  "motivoEncerramento" = 'MIGRACAO_SESSOES'
WHERE "status" = 'ATIVA';

CREATE INDEX "ConversaAgente_tenantId_empresaId_canal_status_atualizadoEm_idx"
  ON "ConversaAgente"("tenantId", "empresaId", "canal", "status", "atualizadoEm");

CREATE TABLE "MemoriaAgente" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "conteudo" TEXT NOT NULL,
  "criadoPorRole" "AgentRole" NOT NULL,
  "origemCanal" TEXT NOT NULL,
  "origemChave" TEXT,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "removidaEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemoriaAgente_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemoriaAgente_tenantId_empresaId_ativa_criadoEm_idx"
  ON "MemoriaAgente"("tenantId", "empresaId", "ativa", "criadoEm");

ALTER TABLE "MemoriaAgente"
  ADD CONSTRAINT "MemoriaAgente_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MemoriaAgente"
  ADD CONSTRAINT "MemoriaAgente_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
