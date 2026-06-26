-- AlterEnum
ALTER TYPE "StatusNotaFiscal" ADD VALUE 'SUBSTITUIDA';

-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "notaSubstituidaId" TEXT;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_notaSubstituidaId_fkey" FOREIGN KEY ("notaSubstituidaId") REFERENCES "NotaFiscal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
