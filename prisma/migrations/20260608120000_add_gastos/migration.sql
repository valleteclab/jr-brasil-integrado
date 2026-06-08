-- Controle de gastos (despesas operacionais por cupom).
CREATE TYPE "GastoOrigem" AS ENUM ('PWA', 'WHATSAPP', 'MANUAL');
CREATE TYPE "GastoStatus" AS ENUM ('PENDENTE', 'CONFIRMADO');

CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "estabelecimento" TEXT NOT NULL,
    "documento" TEXT,
    "categoria" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "formaPagamento" TEXT,
    "origem" "GastoOrigem" NOT NULL DEFAULT 'MANUAL',
    "status" "GastoStatus" NOT NULL DEFAULT 'PENDENTE',
    "imagemCupom" TEXT,
    "iaConfianca" INTEGER,
    "iaBruto" JSONB,
    "contaPagarId" TEXT,
    "lancadoFinanceiro" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GastoItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "gastoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3),
    "valor" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "GastoItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Gasto_tenantId_empresaId_data_idx" ON "Gasto"("tenantId", "empresaId", "data");
CREATE INDEX "Gasto_tenantId_empresaId_categoria_idx" ON "Gasto"("tenantId", "empresaId", "categoria");
CREATE INDEX "GastoItem_tenantId_empresaId_gastoId_idx" ON "GastoItem"("tenantId", "empresaId", "gastoId");

ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GastoItem" ADD CONSTRAINT "GastoItem_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
