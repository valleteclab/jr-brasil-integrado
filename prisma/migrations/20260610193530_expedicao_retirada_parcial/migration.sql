-- AlterEnum
ALTER TYPE "StatusRetirada" ADD VALUE 'PARCIAL';

-- CreateTable
CREATE TABLE "ExpedicaoRetiradaItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "retiradaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "entregue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExpedicaoRetiradaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpedicaoRetiradaItem_tenantId_empresaId_idx" ON "ExpedicaoRetiradaItem"("tenantId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpedicaoRetiradaItem_retiradaId_produtoId_key" ON "ExpedicaoRetiradaItem"("retiradaId", "produtoId");

-- AddForeignKey
ALTER TABLE "ExpedicaoRetiradaItem" ADD CONSTRAINT "ExpedicaoRetiradaItem_retiradaId_fkey" FOREIGN KEY ("retiradaId") REFERENCES "ExpedicaoRetirada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpedicaoRetiradaItem" ADD CONSTRAINT "ExpedicaoRetiradaItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
