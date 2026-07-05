-- Bot do Telegram: config por empresa + vínculo de identidade por chat.
CREATE TABLE "ConfiguracaoTelegram" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "botTokenCripto" TEXT,
    "botUsername" TEXT,
    "webhookSecret" TEXT,
    "atenderClientes" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoTelegram_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfiguracaoTelegram_empresaId_key" ON "ConfiguracaoTelegram"("empresaId");
CREATE INDEX "ConfiguracaoTelegram_tenantId_empresaId_idx" ON "ConfiguracaoTelegram"("tenantId", "empresaId");

ALTER TABLE "ConfiguracaoTelegram" ADD CONSTRAINT "ConfiguracaoTelegram_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConfiguracaoTelegram" ADD CONSTRAINT "ConfiguracaoTelegram_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TelegramVinculo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "telefone" TEXT,
    "nome" TEXT,
    "role" "AgentRole" NOT NULL DEFAULT 'CLIENTE',
    "clienteId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramVinculo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramVinculo_empresaId_chatId_key" ON "TelegramVinculo"("empresaId", "chatId");
CREATE INDEX "TelegramVinculo_tenantId_empresaId_idx" ON "TelegramVinculo"("tenantId", "empresaId");

ALTER TABLE "TelegramVinculo" ADD CONSTRAINT "TelegramVinculo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramVinculo" ADD CONSTRAINT "TelegramVinculo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
