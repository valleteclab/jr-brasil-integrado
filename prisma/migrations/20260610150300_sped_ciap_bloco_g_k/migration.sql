-- AlterTable
ALTER TABLE "SpedConfiguracao" ADD COLUMN     "codAjusteCreditoCiap" TEXT,
ADD COLUMN     "gerarBlocoK" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CiapBem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "identMerc" TEXT NOT NULL DEFAULT '1',
    "funcao" TEXT,
    "vidaUtilAnos" INTEGER NOT NULL DEFAULT 5,
    "valorIcmsOp" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIcmsSt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIcmsFrete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorIcmsDif" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "parcelasTotal" INTEGER NOT NULL DEFAULT 48,
    "imobilizadoEm" TIMESTAMP(3) NOT NULL,
    "baixadoEm" TIMESTAMP(3),
    "fornecedorDocumento" TEXT,
    "fornecedorNome" TEXT,
    "docModelo" TEXT,
    "docSerie" TEXT,
    "docNumero" TEXT,
    "chaveAcesso" TEXT,
    "docEmitidaEm" TIMESTAMP(3),
    "itemCodigo" TEXT,
    "itemQuantidade" DECIMAL(14,4),
    "itemUnidade" TEXT,
    "entradaFiscalItemId" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CiapBem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CiapBem_tenantId_empresaId_imobilizadoEm_idx" ON "CiapBem"("tenantId", "empresaId", "imobilizadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "CiapBem_tenantId_empresaId_codigo_key" ON "CiapBem"("tenantId", "empresaId", "codigo");

-- AddForeignKey
ALTER TABLE "CiapBem" ADD CONSTRAINT "CiapBem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
