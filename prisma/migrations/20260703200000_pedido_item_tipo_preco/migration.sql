-- Origem do preço aplicado pelo vendedor na linha do pedido (VISTA/PRAZO/MANUAL) —
-- auditoria da formação de preço na venda. null = legado (preço à vista).
ALTER TABLE "PedidoVendaItem" ADD COLUMN "tipoPreco" TEXT;
