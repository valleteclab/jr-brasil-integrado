-- AlterTable
ALTER TABLE "SpedConfiguracao" ADD COLUMN     "antecipacaoParcialAtiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "codAjusteCreditoAntecipacao" TEXT,
ADD COLUMN     "codAjusteDebitoAntecipacao" TEXT,
ADD COLUMN     "codigoReceitaAntecipacao" TEXT,
ADD COLUMN     "diaVencimentoAntecipacao" INTEGER NOT NULL DEFAULT 25;
