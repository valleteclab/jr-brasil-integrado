-- Mercado Pago via OAuth: aplicação da plataforma + conta conectada por ContaBancaria. Aditiva.
ALTER TABLE "PlataformaConfiguracao" ADD COLUMN IF NOT EXISTS "mpClientId" TEXT;
ALTER TABLE "PlataformaConfiguracao" ADD COLUMN IF NOT EXISTS "mpClientSecretCripto" TEXT;

ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "mpUserId" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "mpAccessTokenCripto" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "mpRefreshTokenCripto" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "mpPublicKey" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN IF NOT EXISTS "mpTokenExpiraEm" TIMESTAMP(3);
