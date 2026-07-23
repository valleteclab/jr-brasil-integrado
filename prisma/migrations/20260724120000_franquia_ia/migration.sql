-- Franquia mensal de interações de IA por plano + contador de uso por tenant.
ALTER TABLE "PlataformaPlano" ADD COLUMN "franquiaIaMes" INTEGER;
CREATE TABLE "UsoIaMensal" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "competencia" TEXT NOT NULL,
  "interacoes" INTEGER NOT NULL DEFAULT 0,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsoIaMensal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UsoIaMensal_tenantId_competencia_key" ON "UsoIaMensal"("tenantId", "competencia");
