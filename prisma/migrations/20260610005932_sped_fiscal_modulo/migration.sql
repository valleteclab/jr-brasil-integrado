-- CreateEnum
CREATE TYPE "StatusSpedArquivo" AS ENUM ('GERADO', 'ENVIADO_CONTADOR');

-- DropForeignKey
ALTER TABLE "PedidoVenda" DROP CONSTRAINT "PedidoVenda_clienteId_fkey";

-- DropIndex
DROP INDEX "NotaFiscal_notaOrigemId_idx";

-- AlterTable
ALTER TABLE "Cest" ALTER COLUMN "ncms" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "spedFiscalHabilitado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SpedConfiguracao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "perfilArquivo" TEXT NOT NULL DEFAULT 'B',
    "indAtividade" TEXT NOT NULL DEFAULT '1',
    "contadorNome" TEXT,
    "contadorCpf" TEXT,
    "contadorCrc" TEXT,
    "contadorCnpj" TEXT,
    "contadorCep" TEXT,
    "contadorEndereco" TEXT,
    "contadorNumero" TEXT,
    "contadorComplemento" TEXT,
    "contadorBairro" TEXT,
    "contadorTelefone" TEXT,
    "contadorEmail" TEXT,
    "contadorCodigoMunicipioIbge" TEXT,
    "codigoReceitaIcms" TEXT,
    "diaVencimentoIcms" INTEGER NOT NULL DEFAULT 10,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpedConfiguracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpedArquivo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "versaoLeiaute" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "perfilArquivo" TEXT NOT NULL DEFAULT 'B',
    "status" "StatusSpedArquivo" NOT NULL DEFAULT 'GERADO',
    "conteudo" TEXT NOT NULL,
    "totalLinhas" INTEGER NOT NULL,
    "resumo" JSONB NOT NULL,
    "avisos" JSONB NOT NULL,
    "saldoCredorAnterior" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "geradoPor" TEXT,
    "enviadoContadorEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpedArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpedConfiguracao_empresaId_key" ON "SpedConfiguracao"("empresaId");

-- CreateIndex
CREATE INDEX "SpedConfiguracao_tenantId_empresaId_idx" ON "SpedConfiguracao"("tenantId", "empresaId");

-- CreateIndex
CREATE INDEX "SpedArquivo_tenantId_empresaId_status_idx" ON "SpedArquivo"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SpedArquivo_tenantId_empresaId_ano_mes_key" ON "SpedArquivo"("tenantId", "empresaId", "ano", "mes");

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpedConfiguracao" ADD CONSTRAINT "SpedConfiguracao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpedArquivo" ADD CONSTRAINT "SpedArquivo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
