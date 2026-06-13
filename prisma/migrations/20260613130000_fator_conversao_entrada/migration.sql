-- Conversão de embalagem na entrada fiscal: comprar em fardo/caixa e vender unitário.
-- 1 unidade de compra (unidade) = "fatorConversao" unidades de venda (unidadeVenda).
ALTER TABLE "EntradaFiscalItem" ADD COLUMN "fatorConversao" DECIMAL(14,6) NOT NULL DEFAULT 1;
ALTER TABLE "EntradaFiscalItem" ADD COLUMN "unidadeVenda" TEXT;
