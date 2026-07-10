-- Valor personalizado da mensalidade por cliente (desconto/acordo). null = usa o preço do plano.
ALTER TABLE "Tenant" ADD COLUMN "mensalidadeValor" DECIMAL(10,2);
