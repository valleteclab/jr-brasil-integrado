-- Marca a ultima sincronizacao da distribuicao de NF-e recebidas (cron ou manual).
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "distribuicaoSyncEm" TIMESTAMP(3);
