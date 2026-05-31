-- Chave de API por empresa para o servidor MCP (autentica tenant/empresa + papel).
CREATE TABLE "ChaveApiAgente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "role" "AgentRole" NOT NULL DEFAULT 'GESTOR',
    "hashChave" TEXT NOT NULL,
    "chaveFinal" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoUsoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChaveApiAgente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChaveApiAgente_hashChave_key" ON "ChaveApiAgente"("hashChave");
CREATE INDEX "ChaveApiAgente_tenantId_empresaId_idx" ON "ChaveApiAgente"("tenantId", "empresaId");

ALTER TABLE "ChaveApiAgente" ADD CONSTRAINT "ChaveApiAgente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChaveApiAgente" ADD CONSTRAINT "ChaveApiAgente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
