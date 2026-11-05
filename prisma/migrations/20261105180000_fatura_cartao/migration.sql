-- Fatura do cartao de credito: pagar fornecedor no credito nao tira dinheiro do banco no dia,
-- a compra entra na fatura e o banco so e debitado quando a fatura e paga.

-- Ciclo do cartao (usados apenas quando ContaBancaria.tipo = 'CARTAO').
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "cartaoDiaFechamento" INTEGER;
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "cartaoDiaVencimento" INTEGER;

CREATE TABLE IF NOT EXISTS "FaturaCartao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
    "contaBancariaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "fechamento" TIMESTAMP(3) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valorTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "contaPagarId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FaturaCartao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LancamentoFaturaCartao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "faturaCartaoId" TEXT NOT NULL,
    "contaPagarId" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "totalParcelas" INTEGER NOT NULL DEFAULT 1,
    "dataCompra" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LancamentoFaturaCartao_pkey" PRIMARY KEY ("id")
);

-- Uma fatura por cartao por competencia: e o que impede duplicar o ciclo em concorrencia.
CREATE UNIQUE INDEX IF NOT EXISTS "FaturaCartao_tenantId_empresaId_contaBancariaId_competencia_key"
    ON "FaturaCartao"("tenantId", "empresaId", "contaBancariaId", "competencia");
CREATE UNIQUE INDEX IF NOT EXISTS "FaturaCartao_contaPagarId_key" ON "FaturaCartao"("contaPagarId");
CREATE INDEX IF NOT EXISTS "FaturaCartao_tenantId_empresaId_status_idx" ON "FaturaCartao"("tenantId", "empresaId", "status");
CREATE INDEX IF NOT EXISTS "LancamentoFaturaCartao_tenantId_empresaId_faturaCartaoId_idx"
    ON "LancamentoFaturaCartao"("tenantId", "empresaId", "faturaCartaoId");
CREATE INDEX IF NOT EXISTS "LancamentoFaturaCartao_contaPagarId_idx" ON "LancamentoFaturaCartao"("contaPagarId");

DO $$ BEGIN
    ALTER TABLE "FaturaCartao" ADD CONSTRAINT "FaturaCartao_empresaId_fkey"
        FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "FaturaCartao" ADD CONSTRAINT "FaturaCartao_contaBancariaId_fkey"
        FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "FaturaCartao" ADD CONSTRAINT "FaturaCartao_contaPagarId_fkey"
        FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cascade: apagar a fatura leva junto os lancamentos dela (nao existem sozinhos).
DO $$ BEGIN
    ALTER TABLE "LancamentoFaturaCartao" ADD CONSTRAINT "LancamentoFaturaCartao_faturaCartaoId_fkey"
        FOREIGN KEY ("faturaCartaoId") REFERENCES "FaturaCartao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
