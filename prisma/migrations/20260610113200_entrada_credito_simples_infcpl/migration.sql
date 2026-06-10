-- AlterTable
ALTER TABLE "EntradaFiscal" ADD COLUMN     "informacoesComplementares" TEXT;

-- AlterTable
ALTER TABLE "EntradaFiscalItemImposto" ADD COLUMN     "aliquotaCredSn" DECIMAL(8,4),
ADD COLUMN     "valorCredSn" DECIMAL(14,2);
