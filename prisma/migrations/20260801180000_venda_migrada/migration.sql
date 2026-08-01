-- Histórico de vendas do sistema anterior (migração JR) — read-only, fora do operacional. Aditiva.
CREATE TABLE IF NOT EXISTS "VendaMigrada" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "data" TIMESTAMP(3),
  "codigoParceiro" TEXT,
  "parceiroNome" TEXT NOT NULL,
  "clienteId" TEXT,
  "total" DECIMAL(14,2) NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "VendaMigrada_tenantId_empresaId_numero_key" ON "VendaMigrada"("tenantId", "empresaId", "numero");
CREATE INDEX IF NOT EXISTS "VendaMigrada_tenantId_clienteId_idx" ON "VendaMigrada"("tenantId", "clienteId");

CREATE TABLE IF NOT EXISTS "VendaMigradaItem" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "vendaMigradaId" TEXT NOT NULL REFERENCES "VendaMigrada"("id"),
  "codigo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "produtoId" TEXT,
  "preco" DECIMAL(14,2) NOT NULL,
  "quantidade" DECIMAL(14,3) NOT NULL,
  "desconto" DECIMAL(14,2) NOT NULL,
  "total" DECIMAL(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS "VendaMigradaItem_vendaMigradaId_idx" ON "VendaMigradaItem"("vendaMigradaId");
