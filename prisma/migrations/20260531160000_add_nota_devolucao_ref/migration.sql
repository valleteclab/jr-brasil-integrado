-- NF-e de devolução: referência à nota original (chave NFref) e vínculo à nota de origem.
ALTER TABLE "NotaFiscal" ADD COLUMN "notaOrigemId" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "chaveReferenciada" TEXT;

CREATE INDEX "NotaFiscal_notaOrigemId_idx" ON "NotaFiscal"("notaOrigemId");

ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_notaOrigemId_fkey"
  FOREIGN KEY ("notaOrigemId") REFERENCES "NotaFiscal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
