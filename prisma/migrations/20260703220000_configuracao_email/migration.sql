-- Configuração de e-mail (SMTP) por empresa para envio de orçamentos, boletos e notas fiscais
-- ao cliente final. Senha criptografada (secret-crypto), mesmo padrão da ConfiguracaoWhatsapp.
CREATE TABLE "ConfiguracaoEmail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT,
    "porta" INTEGER NOT NULL DEFAULT 587,
    "seguro" BOOLEAN NOT NULL DEFAULT false,
    "usuario" TEXT,
    "senhaCripto" TEXT,
    "remetenteNome" TEXT,
    "remetenteEmail" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfiguracaoEmail_empresaId_key" ON "ConfiguracaoEmail"("empresaId");
CREATE INDEX "ConfiguracaoEmail_tenantId_empresaId_idx" ON "ConfiguracaoEmail"("tenantId", "empresaId");

ALTER TABLE "ConfiguracaoEmail" ADD CONSTRAINT "ConfiguracaoEmail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConfiguracaoEmail" ADD CONSTRAINT "ConfiguracaoEmail_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
