-- Flag: proximo ciclo do cron re-baixa a distribuicao do NSU 0 (corrige resumos antigos sem data).
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "distribuicaoReprocessar" BOOLEAN;
