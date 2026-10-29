-- Recibo de pagamento (despesa sem nota fiscal), numerado por empresa.
CREATE TABLE IF NOT EXISTS "ReciboPagamento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "contaPagarId" TEXT,
  "gastoId" TEXT,
  "favorecidoNome" TEXT NOT NULL,
  "favorecidoDocumento" TEXT,
  "valor" DECIMAL(14,2) NOT NULL,
  "referente" TEXT NOT NULL,
  "dataPagamento" TIMESTAMP(3) NOT NULL,
  "formaPagamento" TEXT,
  "cidade" TEXT,
  "observacao" TEXT,
  "usuarioId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReciboPagamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReciboPagamento_tenantId_empresaId_numero_key"
  ON "ReciboPagamento"("tenantId", "empresaId", "numero");
CREATE INDEX IF NOT EXISTS "ReciboPagamento_tenantId_empresaId_criadoEm_idx"
  ON "ReciboPagamento"("tenantId", "empresaId", "criadoEm");
DO $$ BEGIN
  ALTER TABLE "ReciboPagamento" ADD CONSTRAINT "ReciboPagamento_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ReciboPagamento" ADD CONSTRAINT "ReciboPagamento_contaPagarId_fkey"
    FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
