-- Guias de recolhimento estadual (GNRE ICMS-ST/DIFAL) geradas pela emissão interestadual
CREATE TABLE "GuiaRecolhimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
    "notaFiscalId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'GNRE_ICMS_ST',
    "ufFavorecida" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "numeroGuia" TEXT,
    "pagoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuiaRecolhimento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuiaRecolhimento_notaFiscalId_tipo_key" ON "GuiaRecolhimento"("notaFiscalId", "tipo");
CREATE INDEX "GuiaRecolhimento_tenantId_empresaId_status_idx" ON "GuiaRecolhimento"("tenantId", "empresaId", "status");

ALTER TABLE "GuiaRecolhimento" ADD CONSTRAINT "GuiaRecolhimento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuiaRecolhimento" ADD CONSTRAINT "GuiaRecolhimento_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
