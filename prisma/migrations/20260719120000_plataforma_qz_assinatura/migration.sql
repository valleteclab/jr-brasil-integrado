-- Assinatura das requisições ao QZ Tray (impressão direta no PDV): certificado público + chave privada criptografada.
ALTER TABLE "PlataformaConfiguracao" ADD COLUMN "qzCertificado" TEXT;
ALTER TABLE "PlataformaConfiguracao" ADD COLUMN "qzChaveCripto" TEXT;
