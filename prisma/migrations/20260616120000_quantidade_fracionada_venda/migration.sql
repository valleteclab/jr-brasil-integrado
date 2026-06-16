-- Permite vender quantidade fracionada (ex.: 0,5 metro de brita, meia barra de cano).
-- Converte quantidade de Int para Decimal(14,4) nos itens de venda/orçamento/OS/expedição.
ALTER TABLE "PedidoVendaItem" ALTER COLUMN "quantidade" TYPE DECIMAL(14,4);
ALTER TABLE "OrcamentoItem" ALTER COLUMN "quantidade" TYPE DECIMAL(14,4);
ALTER TABLE "OrdemServicoPeca" ALTER COLUMN "quantidade" TYPE DECIMAL(14,4);
ALTER TABLE "ExpedicaoRetiradaItem" ALTER COLUMN "quantidade" TYPE DECIMAL(14,4);
ALTER TABLE "ExpedicaoRetiradaItem" ALTER COLUMN "entregue" TYPE DECIMAL(14,4);
