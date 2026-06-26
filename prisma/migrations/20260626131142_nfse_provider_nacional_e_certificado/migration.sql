-- AlterEnum
ALTER TYPE "ProvedorFiscal" ADD VALUE 'NACIONAL';

-- AlterTable
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN     "provedorServicos" "ProvedorFiscal";

-- CreateTable
CREATE TABLE "CertificadoDigital" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pfxCriptografado" TEXT NOT NULL,
    "senhaCriptografada" TEXT NOT NULL,
    "titularCnpj" TEXT,
    "validade" TIMESTAMP(3),
    "arquivoNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificadoDigital_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoDigital_empresaId_key" ON "CertificadoDigital"("empresaId");

-- CreateIndex
CREATE INDEX "CertificadoDigital_tenantId_empresaId_idx" ON "CertificadoDigital"("tenantId", "empresaId");

-- AddForeignKey
ALTER TABLE "CertificadoDigital" ADD CONSTRAINT "CertificadoDigital_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
