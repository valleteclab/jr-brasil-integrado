-- Regra de operação da empresa: permitir saída/venda de produtos sem saldo (estoque negativo).
ALTER TABLE "Empresa" ADD COLUMN "permiteVendaSemEstoque" BOOLEAN NOT NULL DEFAULT false;
