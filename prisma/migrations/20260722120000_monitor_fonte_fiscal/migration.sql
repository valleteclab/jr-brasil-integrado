-- Snapshot das fontes oficiais monitoradas pelo cron da Reforma Tributária.
CREATE TABLE "MonitorFonteFiscal" (
  "id" TEXT NOT NULL,
  "fonte" TEXT NOT NULL,
  "itens" JSONB,
  "verificadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonitorFonteFiscal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MonitorFonteFiscal_fonte_key" ON "MonitorFonteFiscal"("fonte");
