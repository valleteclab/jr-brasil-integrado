-- Preco promocional do plano (campanha): o cheio vira o "de" riscado nas paginas de venda.
ALTER TABLE "PlataformaPlano" ADD COLUMN IF NOT EXISTS "precoPromocional" DECIMAL(10,2);
ALTER TABLE "PlataformaPlano" ADD COLUMN IF NOT EXISTS "promocaoRotulo" TEXT;
ALTER TABLE "PlataformaPlano" ADD COLUMN IF NOT EXISTS "promocaoAte" TIMESTAMP(3);
