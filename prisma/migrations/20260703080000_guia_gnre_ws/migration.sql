-- Emissão da GNRE pelo webservice: recibo do lote, linha digitável, código de barras e PDF da guia
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "reciboLote" TEXT;
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "linhaDigitavel" TEXT;
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "codigoBarras" TEXT;
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "pdfBase64" TEXT;
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "situacaoWs" TEXT;
