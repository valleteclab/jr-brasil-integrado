-- Numeração fiscal SEPARADA por ambiente: testes em HOMOLOGAÇÃO não consomem a faixa de PRODUÇÃO.
-- As sequências existentes viram HOMOLOGAÇÃO (refletem os testes feitos até aqui); a numeração de
-- PRODUÇÃO passa a contar do zero quando a empresa emitir em produção.
ALTER TABLE "SequenciaFiscal" ADD COLUMN "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO';

DROP INDEX IF EXISTS "SequenciaFiscal_tenantId_empresaId_modelo_serie_key";
CREATE UNIQUE INDEX "SequenciaFiscal_tenantId_empresaId_modelo_serie_ambiente_key"
  ON "SequenciaFiscal" ("tenantId", "empresaId", "modelo", "serie", "ambiente");
