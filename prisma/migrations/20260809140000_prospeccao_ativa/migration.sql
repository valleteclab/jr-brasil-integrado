ALTER TABLE "PlataformaLead" ADD COLUMN "toquesProspeccao" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlataformaLead" ADD COLUMN "ultimoToqueEm" TIMESTAMP(3);
CREATE TABLE "PlataformaProspeccaoConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "ativo" BOOLEAN NOT NULL DEFAULT false,
  "limiteDia" INTEGER NOT NULL DEFAULT 30,
  "porExecucao" INTEGER NOT NULL DEFAULT 2,
  "horaInicio" INTEGER NOT NULL DEFAULT 9,
  "horaFim" INTEGER NOT NULL DEFAULT 18,
  "somenteDiasUteis" BOOLEAN NOT NULL DEFAULT true,
  "maxToques" INTEGER NOT NULL DEFAULT 3,
  "diasEntreToques" INTEGER NOT NULL DEFAULT 2,
  "toque1" TEXT NOT NULL,
  "toque2" TEXT NOT NULL,
  "toque3" TEXT NOT NULL,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlataformaProspeccaoConfig_pkey" PRIMARY KEY ("id")
);
