-- Formação de preços à vista/a prazo com margem (%) sobre o custo:
-- - Produto ganha preço a prazo e as margens memorizadas para recalcular preços.
-- - Empresa ganha margens padrão para sugerir preços no cadastro e na importação de XML.
-- - EntradaFiscalItem guarda o preço a prazo definido na conferência do novo SKU.
ALTER TABLE "Produto" ADD COLUMN "precoVendaPrazo" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Produto" ADD COLUMN "margemVistaPercentual" DECIMAL(8,4);
ALTER TABLE "Produto" ADD COLUMN "margemPrazoPercentual" DECIMAL(8,4);
ALTER TABLE "Empresa" ADD COLUMN "margemPadraoVistaPct" DECIMAL(8,4);
ALTER TABLE "Empresa" ADD COLUMN "margemPadraoPrazoPct" DECIMAL(8,4);
ALTER TABLE "EntradaFiscalItem" ADD COLUMN "precoVendaPrazoDefinido" DECIMAL(14,2);
