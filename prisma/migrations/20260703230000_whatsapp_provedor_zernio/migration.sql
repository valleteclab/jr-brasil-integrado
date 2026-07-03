-- Provedor ZERNIO (camada sobre a API oficial da Meta/WABA) na configuração de WhatsApp.
-- tokenCripto passa a guardar a API key da Zernio quando provedor = ZERNIO; campos zernio*
-- guardam a conta conectada e o template aprovado usado para iniciar conversas.
ALTER TYPE "ProvedorWhatsapp" ADD VALUE IF NOT EXISTS 'ZERNIO';
ALTER TABLE "ConfiguracaoWhatsapp" ADD COLUMN "zernioAccountId" TEXT;
ALTER TABLE "ConfiguracaoWhatsapp" ADD COLUMN "zernioTemplateNome" TEXT;
ALTER TABLE "ConfiguracaoWhatsapp" ADD COLUMN "zernioTemplateIdioma" TEXT;
