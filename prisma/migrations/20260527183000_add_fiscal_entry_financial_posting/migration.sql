-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "entradaFiscalId" TEXT,
ADD COLUMN     "entradaFiscalParcelaId" TEXT,
ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "numeroDocumento" TEXT,
ADD COLUMN     "origem" TEXT;

-- CreateTable
CREATE TABLE "EntradaFiscalParcela" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "entradaFiscalId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "formaPagamento" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'XML',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntradaFiscalParcela_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntradaFiscalParcela_tenantId_empresaId_entradaFiscalId_idx" ON "EntradaFiscalParcela"("tenantId", "empresaId", "entradaFiscalId");

-- CreateIndex
CREATE INDEX "EntradaFiscalParcela_tenantId_empresaId_vencimento_idx" ON "EntradaFiscalParcela"("tenantId", "empresaId", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "EntradaFiscalParcela_tenantId_empresaId_entradaFiscalId_num_key" ON "EntradaFiscalParcela"("tenantId", "empresaId", "entradaFiscalId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_entradaFiscalParcelaId_key" ON "ContaPagar"("entradaFiscalParcelaId");

-- CreateIndex
CREATE INDEX "ContaPagar_tenantId_empresaId_fornecedorId_vencimento_idx" ON "ContaPagar"("tenantId", "empresaId", "fornecedorId", "vencimento");

-- CreateIndex
CREATE INDEX "ContaPagar_tenantId_empresaId_entradaFiscalId_idx" ON "ContaPagar"("tenantId", "empresaId", "entradaFiscalId");

-- AddForeignKey
ALTER TABLE "EntradaFiscalParcela" ADD CONSTRAINT "EntradaFiscalParcela_entradaFiscalId_fkey" FOREIGN KEY ("entradaFiscalId") REFERENCES "EntradaFiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_entradaFiscalId_fkey" FOREIGN KEY ("entradaFiscalId") REFERENCES "EntradaFiscal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_entradaFiscalParcelaId_fkey" FOREIGN KEY ("entradaFiscalParcelaId") REFERENCES "EntradaFiscalParcela"("id") ON DELETE SET NULL ON UPDATE CASCADE;
