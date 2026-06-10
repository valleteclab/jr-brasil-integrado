-- CreateEnum
CREATE TYPE "StatusComissao" AS ENUM ('A_PAGAR', 'PAGO', 'CANCELADO');

-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "vendedorId" TEXT;

-- AlterTable
ALTER TABLE "PedidoVenda" ADD COLUMN     "vendedorId" TEXT;

-- CreateTable
CREATE TABLE "Vendedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "percentualComissao" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComissaoVenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "pedidoVendaId" TEXT NOT NULL,
    "base" DECIMAL(14,2) NOT NULL,
    "percentual" DECIMAL(5,2) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "status" "StatusComissao" NOT NULL DEFAULT 'A_PAGAR',
    "pagoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComissaoVenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendedor_tenantId_empresaId_ativo_idx" ON "Vendedor"("tenantId", "empresaId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_tenantId_empresaId_nome_key" ON "Vendedor"("tenantId", "empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoVenda_pedidoVendaId_key" ON "ComissaoVenda"("pedidoVendaId");

-- CreateIndex
CREATE INDEX "ComissaoVenda_tenantId_empresaId_status_idx" ON "ComissaoVenda"("tenantId", "empresaId", "status");

-- CreateIndex
CREATE INDEX "ComissaoVenda_tenantId_empresaId_vendedorId_status_idx" ON "ComissaoVenda"("tenantId", "empresaId", "vendedorId", "status");

-- AddForeignKey
ALTER TABLE "PedidoVenda" ADD CONSTRAINT "PedidoVenda_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendedor" ADD CONSTRAINT "Vendedor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoVenda" ADD CONSTRAINT "ComissaoVenda_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoVenda" ADD CONSTRAINT "ComissaoVenda_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoVenda" ADD CONSTRAINT "ComissaoVenda_pedidoVendaId_fkey" FOREIGN KEY ("pedidoVendaId") REFERENCES "PedidoVenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
