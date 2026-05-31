-- CSC da NFC-e (idCSC + código), separado do client_id/secret do OAuth do ACBr.
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "nfceIdCsc" TEXT;
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "nfceCscCriptografado" TEXT;
