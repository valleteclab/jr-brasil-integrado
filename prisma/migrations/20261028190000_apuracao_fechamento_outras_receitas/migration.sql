-- Fechamento da apuração, outras receitas (fora de nota) e tese do ICMS fora da base.
DO $$ BEGIN
  CREATE TYPE "TipoOutraReceita" AS ENUM ('FINANCEIRA', 'ALUGUEL', 'GANHO_CAPITAL', 'OUTRA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TipoApuracaoFiscal" AS ENUM ('IRPJ_CSLL', 'PIS_COFINS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OutraReceita" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "competencia" TIMESTAMP(3) NOT NULL,
  "tipo" "TipoOutraReceita" NOT NULL DEFAULT 'OUTRA',
  "descricao" TEXT NOT NULL,
  "valor" DECIMAL(14,2) NOT NULL,
  "observacao" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutraReceita_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OutraReceita_tenantId_empresaId_competencia_idx"
  ON "OutraReceita"("tenantId", "empresaId", "competencia");
DO $$ BEGIN
  ALTER TABLE "OutraReceita" ADD CONSTRAINT "OutraReceita_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ApuracaoFiscalFechada" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "tipo" "TipoApuracaoFiscal" NOT NULL,
  "ano" INTEGER NOT NULL,
  "periodo" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "totalRecolher" DECIMAL(14,2) NOT NULL,
  "observacao" TEXT,
  "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechadoPor" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApuracaoFiscalFechada_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApuracaoFiscalFechada_tenant_empresa_tipo_ano_periodo_key"
  ON "ApuracaoFiscalFechada"("tenantId", "empresaId", "tipo", "ano", "periodo");
CREATE INDEX IF NOT EXISTS "ApuracaoFiscalFechada_tenantId_empresaId_tipo_idx"
  ON "ApuracaoFiscalFechada"("tenantId", "empresaId", "tipo");
DO $$ BEGIN
  ALTER TABLE "ApuracaoFiscalFechada" ADD CONSTRAINT "ApuracaoFiscalFechada_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN IF NOT EXISTS "excluirIcmsBasePisCofins" BOOLEAN DEFAULT false;
