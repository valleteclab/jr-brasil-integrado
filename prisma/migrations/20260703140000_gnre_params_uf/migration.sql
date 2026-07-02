-- Parâmetros GNRE por UF na regra tributária (tipo de doc de origem, detalhamento, campos extras)
-- e cópia na guia — permitem o botão "Emitir GNRE" funcionar sem parâmetros manuais por UF.
ALTER TABLE "RegraTributaria" ADD COLUMN "gnreTipoDocOrigem" TEXT;
ALTER TABLE "RegraTributaria" ADD COLUMN "gnreDetalhamento" TEXT;
ALTER TABLE "RegraTributaria" ADD COLUMN "gnreCamposExtras" TEXT;
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "tipoDocOrigemGnre" TEXT;
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "detalhamentoGnre" TEXT;
ALTER TABLE "GuiaRecolhimento" ADD COLUMN "camposExtrasGnre" TEXT;
