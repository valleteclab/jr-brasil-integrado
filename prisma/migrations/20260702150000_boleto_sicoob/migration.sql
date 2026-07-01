-- Cobrança Sicoob: credenciamento por conta bancária + boletos registrados por recebível.
ALTER TABLE "ContaBancaria" ADD COLUMN "sicoobClientId" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "sicoobNumeroCliente" INTEGER;
ALTER TABLE "ContaBancaria" ADD COLUMN "sicoobContaCorrente" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "sicoobModalidade" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ContaBancaria" ADD COLUMN "sicoobSandbox" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ContaBancaria" ADD COLUMN "sicoobSandboxToken" TEXT;

CREATE TABLE "BoletoCobranca" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "contaReceberId" TEXT NOT NULL,
  "contaBancariaId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'EMITIDO',
  "nossoNumero" TEXT,
  "seuNumero" TEXT,
  "linhaDigitavel" TEXT,
  "codigoBarras" TEXT,
  "valor" DECIMAL(14,2) NOT NULL,
  "vencimento" TIMESTAMP(3) NOT NULL,
  "pdfBase64" TEXT,
  "ultimoErro" TEXT,
  "payload" JSONB,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BoletoCobranca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoletoCobranca_contaReceberId_key" ON "BoletoCobranca"("contaReceberId");
CREATE INDEX "BoletoCobranca_tenantId_empresaId_status_idx" ON "BoletoCobranca"("tenantId", "empresaId", "status");
CREATE INDEX "BoletoCobranca_tenantId_empresaId_nossoNumero_idx" ON "BoletoCobranca"("tenantId", "empresaId", "nossoNumero");

ALTER TABLE "BoletoCobranca" ADD CONSTRAINT "BoletoCobranca_contaReceberId_fkey"
  FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoletoCobranca" ADD CONSTRAINT "BoletoCobranca_contaBancariaId_fkey"
  FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
