-- Identidade visual (branding) por empresa exibida no sistema: logo (data URL base64) e cor de destaque (hex).
ALTER TABLE "Empresa" ADD COLUMN "logoSistema" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "corDestaque" TEXT;
