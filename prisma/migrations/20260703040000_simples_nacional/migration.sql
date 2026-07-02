-- Apuração do Simples Nacional: anexo + folha (Fator R) na empresa; flag de produto monofásico
ALTER TABLE "Empresa" ADD COLUMN "simplesAnexo" INTEGER;
ALTER TABLE "Empresa" ADD COLUMN "simplesFolhaMensal" DECIMAL(14,2);
ALTER TABLE "ProdutoFiscal" ADD COLUMN "pisCofinsMonofasico" BOOLEAN NOT NULL DEFAULT false;
