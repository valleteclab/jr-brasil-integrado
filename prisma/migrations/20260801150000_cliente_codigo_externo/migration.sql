-- Código do cliente no sistema anterior (migração JR — De/Para p/ importar vendas). Aditiva.
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "codigoExterno" TEXT;
CREATE INDEX IF NOT EXISTS "Cliente_tenantId_codigoExterno_idx" ON "Cliente"("tenantId", "codigoExterno");
