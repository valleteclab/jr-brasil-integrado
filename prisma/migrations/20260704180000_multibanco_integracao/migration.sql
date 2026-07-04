-- Integração multibanco (Sicredi/Itaú) além do Sicoob: discriminador + credenciais genéricas.
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoIntegrado" TEXT NOT NULL DEFAULT 'SICOOB';
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoClientId" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoClientSecret" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoApiKey" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoAcesso" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoBeneficiario" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoCooperativa" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoPosto" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoConta" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoConvenio" TEXT;
ALTER TABLE "ContaBancaria" ADD COLUMN "bancoSandbox" BOOLEAN NOT NULL DEFAULT false;
