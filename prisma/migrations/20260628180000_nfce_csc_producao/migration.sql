-- CSC da NFC-e por ambiente: par de PRODUCAO (os campos sem sufixo sao de HOMOLOGACAO).
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "nfceIdCscProducao" TEXT;
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "nfceCscProducaoCriptografado" TEXT;
