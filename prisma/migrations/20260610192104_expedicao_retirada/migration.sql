-- CreateEnum
CREATE TYPE "StatusRetirada" AS ENUM ('PENDENTE', 'ENTREGUE', 'CANCELADA');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "expedicaoHabilitada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ExpedicaoRetirada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "pedidoVendaId" TEXT NOT NULL,
    "status" "StatusRetirada" NOT NULL DEFAULT 'PENDENTE',
    "entreguePor" TEXT,
    "entregueEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpedicaoRetirada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpedicaoRetirada_tenantId_empresaId_status_idx" ON "ExpedicaoRetirada"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExpedicaoRetirada_tenantId_empresaId_codigo_key" ON "ExpedicaoRetirada"("tenantId", "empresaId", "codigo");

-- AddForeignKey
ALTER TABLE "ExpedicaoRetirada" ADD CONSTRAINT "ExpedicaoRetirada_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpedicaoRetirada" ADD CONSTRAINT "ExpedicaoRetirada_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
