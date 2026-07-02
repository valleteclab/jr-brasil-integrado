-- Código de PRODUTO da GNRE (tabela por UF, ex.: DF 20 = autopeças) na regra e na guia
ALTER TABLE "RegraTributaria" ADD COLUMN "gnreProduto" TEXT;
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "produtoGnre" TEXT;
