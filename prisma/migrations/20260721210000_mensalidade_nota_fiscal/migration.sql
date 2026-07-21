-- Vínculo fatura da mensalidade (Asaas) ↔ NFS-e emitida pelo dono do SaaS.
CREATE TABLE "MensalidadeNotaFiscal" (
  "id" TEXT NOT NULL,
  "faturaAsaasId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "notaId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MensalidadeNotaFiscal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MensalidadeNotaFiscal_faturaAsaasId_key" ON "MensalidadeNotaFiscal"("faturaAsaasId");
CREATE INDEX "MensalidadeNotaFiscal_tenantId_idx" ON "MensalidadeNotaFiscal"("tenantId");
