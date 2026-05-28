-- CreateEnum
CREATE TYPE "ProvedorIa" AS ENUM ('OPENROUTER');

-- CreateTable
CREATE TABLE "ConfiguracaoIa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provedor" "ProvedorIa" NOT NULL DEFAULT 'OPENROUTER',
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "modelo" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    "chaveCriptografada" TEXT NOT NULL,
    "chaveFinal" TEXT,
    "observacoes" TEXT,
    "testadoEm" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoIa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfiguracaoIa_tenantId_empresaId_idx" ON "ConfiguracaoIa"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoIa_tenantId_empresaId_provedor_key" ON "ConfiguracaoIa"("tenantId", "empresaId", "provedor");

-- AddForeignKey
ALTER TABLE "ConfiguracaoIa" ADD CONSTRAINT "ConfiguracaoIa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
