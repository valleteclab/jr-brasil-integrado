-- Chave PIX na conta bancária (recebedora).
ALTER TABLE "ContaBancaria" ADD COLUMN "chavePix" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "tipoChavePix" TEXT;

-- Detalhe do recebimento no pagamento da venda.
ALTER TABLE "PagamentoVenda" ADD COLUMN "contaBancariaId" TEXT;
ALTER TABLE "PagamentoVenda" ADD COLUMN "maquinaCartaoId" TEXT;
ALTER TABLE "PagamentoVenda" ADD COLUMN "nsu" TEXT;
ALTER TABLE "PagamentoVenda" ADD COLUMN "bandeira" TEXT;
ALTER TABLE "PagamentoVenda" ADD COLUMN "parcelas" INTEGER;
ALTER TABLE "PagamentoVenda" ADD COLUMN "autorizacao" TEXT;

-- Máquinas de cartão (maquininhas).
CREATE TABLE "MaquinaCartao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "adquirente" TEXT,
    "contaBancariaId" TEXT,
    "taxaDebito" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxaCredito" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxaCreditoParcelado" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "prazoDebitoDias" INTEGER NOT NULL DEFAULT 1,
    "prazoCreditoDias" INTEGER NOT NULL DEFAULT 30,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaquinaCartao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MaquinaCartao_tenantId_empresaId_nome_key" ON "MaquinaCartao"("tenantId", "empresaId", "nome");
CREATE INDEX "MaquinaCartao_tenantId_empresaId_idx" ON "MaquinaCartao"("tenantId", "empresaId");
ALTER TABLE "MaquinaCartao" ADD CONSTRAINT "MaquinaCartao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
