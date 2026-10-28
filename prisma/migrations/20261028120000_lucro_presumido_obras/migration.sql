-- Módulo de apuração do Lucro Presumido/Real: contratos de obra e regime de reconhecimento.
DO $$ BEGIN
  CREATE TYPE "ModalidadeEmpreitada" AS ENUM ('TOTAL', 'PARCIAL', 'ADMINISTRACAO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ObraContrato" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "descricao" TEXT,
  "contratante" TEXT,
  "documento" TEXT,
  "modalidade" "ModalidadeEmpreitada" NOT NULL DEFAULT 'TOTAL',
  "observacoes" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ObraContrato_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ObraContrato_tenantId_empresaId_numero_key"
  ON "ObraContrato"("tenantId", "empresaId", "numero");
CREATE INDEX IF NOT EXISTS "ObraContrato_tenantId_empresaId_ativo_idx"
  ON "ObraContrato"("tenantId", "empresaId", "ativo");

DO $$ BEGIN
  ALTER TABLE "ObraContrato" ADD CONSTRAINT "ObraContrato_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "obraContratoId" TEXT;
CREATE INDEX IF NOT EXISTS "NotaFiscal_obraContratoId_idx" ON "NotaFiscal"("obraContratoId");
DO $$ BEGIN
  ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_obraContratoId_fkey"
    FOREIGN KEY ("obraContratoId") REFERENCES "ObraContrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN IF NOT EXISTS "regimeReceitaCaixa" BOOLEAN DEFAULT false;
