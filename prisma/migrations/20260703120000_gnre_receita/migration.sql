-- Código de RECEITA da GNRE por UF de destino (100048 ST por apuração / 100099 ST por operação —
-- varia por UF, consultável via GnreConfigUF) na regra tributária e na guia
ALTER TABLE "RegraTributaria" ADD COLUMN "gnreReceita" TEXT;
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "receitaGnre" TEXT;
