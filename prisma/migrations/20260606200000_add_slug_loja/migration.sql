-- Identificador da loja virtual na URL (/loja/{slugLoja}), único entre todas as empresas.
ALTER TABLE "Empresa" ADD COLUMN "slugLoja" TEXT;
CREATE UNIQUE INDEX "Empresa_slugLoja_key" ON "Empresa"("slugLoja");
