-- Credenciais de integrações externas por empresa (ex.: catálogo Cosmos/Bluesoft), chave criptografada.
CREATE TABLE "ConfiguracaoIntegracao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "chaveCriptografada" TEXT NOT NULL,
    "chaveFinal" TEXT,
    "observacoes" TEXT,
    "testadoEm" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoIntegracao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfiguracaoIntegracao_tenantId_empresaId_provedor_key" ON "ConfiguracaoIntegracao"("tenantId", "empresaId", "provedor");
CREATE INDEX "ConfiguracaoIntegracao_tenantId_empresaId_idx" ON "ConfiguracaoIntegracao"("tenantId", "empresaId");

ALTER TABLE "ConfiguracaoIntegracao" ADD CONSTRAINT "ConfiguracaoIntegracao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConfiguracaoIntegracao" ADD CONSTRAINT "ConfiguracaoIntegracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
