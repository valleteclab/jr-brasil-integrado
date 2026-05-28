ALTER TABLE "ProdutoFiscal" ADD COLUMN "regraTributariaId" TEXT;

CREATE INDEX "ProdutoFiscal_tenantId_empresaId_regraTributariaId_idx" ON "ProdutoFiscal"("tenantId", "empresaId", "regraTributariaId");

ALTER TABLE "ProdutoFiscal" ADD CONSTRAINT "ProdutoFiscal_regraTributariaId_fkey" FOREIGN KEY ("regraTributariaId") REFERENCES "RegraTributaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
