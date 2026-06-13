-- Conversão de embalagem no pedido de compra manual: comprar em fardo/caixa e vender unitário.
-- quantidade/custoUnitario seguem a unidade de compra; ao receber, estoque = quantidade × fatorConversao.
ALTER TABLE "PedidoCompraItem" ADD COLUMN "fatorConversao" DECIMAL(14,6) NOT NULL DEFAULT 1;
ALTER TABLE "PedidoCompraItem" ADD COLUMN "unidadeCompra" TEXT;
