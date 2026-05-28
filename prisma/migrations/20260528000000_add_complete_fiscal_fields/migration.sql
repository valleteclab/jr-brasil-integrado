-- Migration: add_complete_fiscal_fields
-- Adds per-tax CST/alíquota fields to ProdutoFiscal,
-- ICMS-ST/FCP fields to RegraTributaria,
-- tax totals to EntradaFiscal,
-- and ICMS-ST/FCP fields to EntradaFiscalItemImposto.

-- ProdutoFiscal: ICMS normal
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "icmsCST" TEXT;
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "icmsCSOSN" TEXT;
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "icmsModBC" INTEGER;
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "icmsAliquota" DECIMAL(8,4);
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "icmsReducaoBC" DECIMAL(8,4);

-- ProdutoFiscal: ICMS-ST
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "icmsSTModBC" INTEGER;
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "icmsSTMVA" DECIMAL(8,4);
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "icmsSTReducaoBC" DECIMAL(8,4);
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "icmsSTAliquota" DECIMAL(8,4);

-- ProdutoFiscal: FCP
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "fcpAliquota" DECIMAL(8,4);
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "fcpSTAliquota" DECIMAL(8,4);

-- ProdutoFiscal: IPI
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "ipiCST" TEXT;
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "ipiCodEnq" TEXT;
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "ipiAliquota" DECIMAL(8,4);

-- ProdutoFiscal: PIS
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "pisCST" TEXT;
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "pisAliquota" DECIMAL(8,4);

-- ProdutoFiscal: COFINS
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "cofinsCST" TEXT;
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "cofinsAliquota" DECIMAL(8,4);

-- ProdutoFiscal: ISS
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "issAliquota" DECIMAL(8,4);
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "issItemListServico" TEXT;

-- ProdutoFiscal: NF-e 4.0
ALTER TABLE "ProdutoFiscal" ADD COLUMN IF NOT EXISTS "indicadorEscalaRelevante" TEXT;

-- RegraTributaria: modalidade BC e ICMS-ST
ALTER TABLE "RegraTributaria" ADD COLUMN IF NOT EXISTS "modBC" INTEGER;
ALTER TABLE "RegraTributaria" ADD COLUMN IF NOT EXISTS "mva" DECIMAL(8,4);
ALTER TABLE "RegraTributaria" ADD COLUMN IF NOT EXISTS "reducaoBaseST" DECIMAL(8,4);
ALTER TABLE "RegraTributaria" ADD COLUMN IF NOT EXISTS "aliquotaST" DECIMAL(8,4);

-- RegraTributaria: FCP
ALTER TABLE "RegraTributaria" ADD COLUMN IF NOT EXISTS "aliquotaFCP" DECIMAL(8,4);
ALTER TABLE "RegraTributaria" ADD COLUMN IF NOT EXISTS "aliquotaFCPST" DECIMAL(8,4);

-- RegraTributaria: observações
ALTER TABLE "RegraTributaria" ADD COLUMN IF NOT EXISTS "observacoes" TEXT;

-- EntradaFiscal: totais fiscais da NF-e (essenciais para SPED)
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorBCICMS" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorICMS" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorBCICMSST" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorICMSST" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorIPI" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorPIS" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorCOFINS" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorFCP" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorFCPST" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "valorTributos" DECIMAL(14,2);
ALTER TABLE "EntradaFiscal" ADD COLUMN IF NOT EXISTS "modalidadeFrete" INTEGER;

-- EntradaFiscalItemImposto: ICMS-ST
ALTER TABLE "EntradaFiscalItemImposto" ADD COLUMN IF NOT EXISTS "baseST" DECIMAL(14,2);
ALTER TABLE "EntradaFiscalItemImposto" ADD COLUMN IF NOT EXISTS "aliquotaST" DECIMAL(8,4);
ALTER TABLE "EntradaFiscalItemImposto" ADD COLUMN IF NOT EXISTS "valorST" DECIMAL(14,2);
ALTER TABLE "EntradaFiscalItemImposto" ADD COLUMN IF NOT EXISTS "mva" DECIMAL(8,4);

-- EntradaFiscalItemImposto: FCP
ALTER TABLE "EntradaFiscalItemImposto" ADD COLUMN IF NOT EXISTS "valorFCP" DECIMAL(14,2);
ALTER TABLE "EntradaFiscalItemImposto" ADD COLUMN IF NOT EXISTS "aliquotaFCP" DECIMAL(8,4);
ALTER TABLE "EntradaFiscalItemImposto" ADD COLUMN IF NOT EXISTS "valorFCPST" DECIMAL(14,2);
ALTER TABLE "EntradaFiscalItemImposto" ADD COLUMN IF NOT EXISTS "aliquotaFCPST" DECIMAL(8,4);
