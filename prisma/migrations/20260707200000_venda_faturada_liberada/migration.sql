-- Venda faturada (boleto/crediario) liberada por cliente (so o perfil financeiro libera).
ALTER TABLE "Cliente" ADD COLUMN "vendaFaturadaLiberada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cliente" ADD COLUMN "vendaFaturadaLiberadaPor" TEXT;
ALTER TABLE "Cliente" ADD COLUMN "vendaFaturadaLiberadaEm" TIMESTAMP(3);
ALTER TABLE "Cliente" ADD COLUMN "vendaFaturadaObs" TEXT;
