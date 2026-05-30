-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "valorFcp" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "NotaFiscalItem" ADD COLUMN     "aliquotaIcmsSt" DECIMAL(8,4),
ADD COLUMN     "baseIcmsSt" DECIMAL(14,2),
ADD COLUMN     "modalidadeBcSt" TEXT,
ADD COLUMN     "percentualFcp" DECIMAL(8,4),
ADD COLUMN     "percentualMva" DECIMAL(8,4),
ADD COLUMN     "valorFcp" DECIMAL(14,2),
ADD COLUMN     "valorIcmsSt" DECIMAL(14,2),
ADD COLUMN     "valorTributos" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "RegraTributaria" ADD COLUMN     "aliquotaIcmsSt" DECIMAL(8,4),
ADD COLUMN     "fcp" DECIMAL(8,4),
ADD COLUMN     "mva" DECIMAL(8,4);
