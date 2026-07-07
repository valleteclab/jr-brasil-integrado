-- Comunicacao interna: notificacoes (sino) + chat 1-a-1 entre usuarios.
CREATE TABLE "Notificacao" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "destinoUsuarioId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'GERAL',
  "titulo" TEXT NOT NULL,
  "mensagem" TEXT NOT NULL,
  "link" TEXT,
  "lida" BOOLEAN NOT NULL DEFAULT false,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notificacao_destinoUsuarioId_lida_idx" ON "Notificacao"("destinoUsuarioId", "lida");
CREATE INDEX "Notificacao_tenantId_empresaId_criadoEm_idx" ON "Notificacao"("tenantId", "empresaId", "criadoEm");

CREATE TABLE "MensagemInterna" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "deUsuarioId" TEXT NOT NULL,
  "paraUsuarioId" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "lida" BOOLEAN NOT NULL DEFAULT false,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MensagemInterna_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MensagemInterna_paraUsuarioId_lida_idx" ON "MensagemInterna"("paraUsuarioId", "lida");
CREATE INDEX "MensagemInterna_deUsuarioId_paraUsuarioId_criadoEm_idx" ON "MensagemInterna"("deUsuarioId", "paraUsuarioId", "criadoEm");
