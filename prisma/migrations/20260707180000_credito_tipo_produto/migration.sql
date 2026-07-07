-- Slug do tipo (produto) por PF/PJ, configuravel no /admin (evita hardcode/adivinhacao).
ALTER TABLE "PlataformaCredito" ADD COLUMN "apibrasilTipoPF" TEXT;
ALTER TABLE "PlataformaCredito" ADD COLUMN "apibrasilTipoPJ" TEXT;
