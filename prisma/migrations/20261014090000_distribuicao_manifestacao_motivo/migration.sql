-- Motivo (cStat + xMotivo) do retorno da SEFAZ na manifestacao do destinatario.
ALTER TABLE "DistribuicaoNfeDocumento" ADD COLUMN IF NOT EXISTS "manifestacaoMotivo" TEXT;
