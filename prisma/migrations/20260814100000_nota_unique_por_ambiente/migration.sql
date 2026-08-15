-- Unicidade da numeracao fiscal POR AMBIENTE: nota de homologacao nao pode bloquear a de producao.
DROP INDEX IF EXISTS "NotaFiscal_tenantId_empresaId_modelo_serie_numero_key";
CREATE UNIQUE INDEX "NotaFiscal_tenantId_empresaId_modelo_serie_ambiente_numero_key" ON "NotaFiscal"("tenantId", "empresaId", "modelo", "serie", "ambiente", "numero");
