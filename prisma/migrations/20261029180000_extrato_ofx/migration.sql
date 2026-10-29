-- Importação de extrato bancário/fatura por arquivo OFX, com conciliação manual (nada é
-- lançado automaticamente: linha sem vínculo fica PENDENTE).
DO $$ BEGIN
  CREATE TYPE "StatusLinhaExtrato" AS ENUM ('PENDENTE', 'CONCILIADA', 'IGNORADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ExtratoOfxImportacao" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "contaBancariaId" TEXT NOT NULL,
  "arquivoNome" TEXT NOT NULL,
  "banco" TEXT,
  "contaDeclarada" TEXT,
  "tipoConta" TEXT,
  "dataInicial" TIMESTAMP(3),
  "dataFinal" TIMESTAMP(3),
  "saldoFinal" DECIMAL(14,2),
  "saldoData" TIMESTAMP(3),
  "totalLinhas" INTEGER NOT NULL DEFAULT 0,
  "linhasNovas" INTEGER NOT NULL DEFAULT 0,
  "linhasDuplicadas" INTEGER NOT NULL DEFAULT 0,
  "usuarioId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExtratoOfxImportacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ExtratoOfxImportacao_tenant_empresa_conta_idx"
  ON "ExtratoOfxImportacao"("tenantId", "empresaId", "contaBancariaId");

CREATE TABLE IF NOT EXISTS "ExtratoOfxLinha" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "contaBancariaId" TEXT NOT NULL,
  "importacaoId" TEXT NOT NULL,
  "fitid" TEXT NOT NULL,
  "data" TIMESTAMP(3) NOT NULL,
  "valor" DECIMAL(14,2) NOT NULL,
  "tipo" TEXT,
  "descricao" TEXT NOT NULL,
  "documento" TEXT,
  "status" "StatusLinhaExtrato" NOT NULL DEFAULT 'PENDENTE',
  "contaPagarId" TEXT,
  "contaReceberId" TEXT,
  "gastoId" TEXT,
  "motivoIgnorada" TEXT,
  "conciliadoEm" TIMESTAMP(3),
  "conciliadoPor" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExtratoOfxLinha_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExtratoOfxLinha_tenant_empresa_conta_fitid_key"
  ON "ExtratoOfxLinha"("tenantId", "empresaId", "contaBancariaId", "fitid");
CREATE INDEX IF NOT EXISTS "ExtratoOfxLinha_tenant_empresa_status_data_idx"
  ON "ExtratoOfxLinha"("tenantId", "empresaId", "status", "data");

DO $$ BEGIN
  ALTER TABLE "ExtratoOfxImportacao" ADD CONSTRAINT "ExtratoOfxImportacao_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ExtratoOfxImportacao" ADD CONSTRAINT "ExtratoOfxImportacao_contaBancariaId_fkey"
    FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ExtratoOfxLinha" ADD CONSTRAINT "ExtratoOfxLinha_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ExtratoOfxLinha" ADD CONSTRAINT "ExtratoOfxLinha_contaBancariaId_fkey"
    FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ExtratoOfxLinha" ADD CONSTRAINT "ExtratoOfxLinha_importacaoId_fkey"
    FOREIGN KEY ("importacaoId") REFERENCES "ExtratoOfxImportacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ExtratoOfxLinha" ADD CONSTRAINT "ExtratoOfxLinha_contaPagarId_fkey"
    FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ExtratoOfxLinha" ADD CONSTRAINT "ExtratoOfxLinha_contaReceberId_fkey"
    FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
