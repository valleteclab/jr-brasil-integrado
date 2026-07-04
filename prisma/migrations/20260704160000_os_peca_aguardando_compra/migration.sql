-- Peça da OS a COMPRAR (aguardando chegada) + marca de chegada (via entrada fiscal).
ALTER TABLE "OrdemServicoPeca" ADD COLUMN "aguardandoCompra" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrdemServicoPeca" ADD COLUMN "chegouEm" TIMESTAMP(3);
CREATE INDEX "OrdemServicoPeca_tenantId_empresaId_produtoId_aguardandoCompra_idx"
  ON "OrdemServicoPeca"("tenantId", "empresaId", "produtoId", "aguardandoCompra");
