-- Antecipação de recebíveis: operação que baixa os títulos pelo BRUTO e lança a taxa como
-- despesa financeira paga (ContaPagar "Juros de antecipação").
CREATE TABLE "AntecipacaoRecebivel" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
  "contaBancariaId" TEXT NOT NULL,
  "instituicao" TEXT,
  "dataOperacao" TIMESTAMP(3) NOT NULL,
  "valorBruto" DECIMAL(14,2) NOT NULL,
  "valorTaxa" DECIMAL(14,2) NOT NULL,
  "valorLiquido" DECIMAL(14,2) NOT NULL,
  "observacoes" TEXT,
  "contaPagarTaxaId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AntecipacaoRecebivel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AntecipacaoRecebivel_contaPagarTaxaId_key" ON "AntecipacaoRecebivel"("contaPagarTaxaId");
CREATE INDEX "AntecipacaoRecebivel_tenantId_empresaId_dataOperacao_idx"
  ON "AntecipacaoRecebivel"("tenantId", "empresaId", "dataOperacao");

ALTER TABLE "AntecipacaoRecebivel" ADD CONSTRAINT "AntecipacaoRecebivel_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AntecipacaoRecebivel" ADD CONSTRAINT "AntecipacaoRecebivel_contaBancariaId_fkey"
  FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AntecipacaoRecebivel" ADD CONSTRAINT "AntecipacaoRecebivel_contaPagarTaxaId_fkey"
  FOREIGN KEY ("contaPagarTaxaId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContaReceber" ADD COLUMN "antecipacaoId" TEXT;
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_antecipacaoId_fkey"
  FOREIGN KEY ("antecipacaoId") REFERENCES "AntecipacaoRecebivel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ContaReceber_tenantId_empresaId_antecipacaoId_idx"
  ON "ContaReceber"("tenantId", "empresaId", "antecipacaoId");
