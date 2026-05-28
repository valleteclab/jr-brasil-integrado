-- Expansão da NotaFiscal e criação de NotaFiscalItem + NotaFiscalPagamento
-- para suportar emissão de NF-e 4.0

-- ─── NotaFiscal: novos campos ───────────────────────────────────────────────

ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "naturezaOperacao" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "tipoNF"            INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "finalidade"        INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "consumidorFinal"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "presencaComprador" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "dataEmissao"       TIMESTAMP(3);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "dataSaida"         TIMESTAMP(3);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "modalidadeFrete"   INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorProdutos"     DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorDesconto"     DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorFrete"        DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorSeguro"       DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorOutras"       DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorBCICMS"       DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorICMS"         DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorBCICMSST"     DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorICMSST"       DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorFCP"          DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorIPI"          DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorPIS"          DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorCOFINS"       DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "valorTributos"     DECIMAL(14,2);
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "infAdic"           TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "infCpl"            TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN IF NOT EXISTS "motivoRejeicao"    TEXT;

CREATE INDEX IF NOT EXISTS "NotaFiscal_tenantId_empresaId_dataEmissao_idx"
  ON "NotaFiscal"("tenantId", "empresaId", "dataEmissao");

-- ─── NotaFiscalItem ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "NotaFiscalItem" (
  "id"             TEXT    NOT NULL,
  "tenantId"       TEXT    NOT NULL,
  "notaFiscalId"   TEXT    NOT NULL,
  "produtoId"      TEXT,
  "seq"            INTEGER NOT NULL,
  "descricao"      TEXT    NOT NULL,
  "ncm"            TEXT,
  "cest"           TEXT,
  "cfop"           TEXT    NOT NULL,
  "unidade"        TEXT    NOT NULL,
  "gtin"           TEXT,
  "origem"         TEXT,
  "quantidade"     DECIMAL(12,4) NOT NULL,
  "valorUnitario"  DECIMAL(14,4) NOT NULL,
  "valorBruto"     DECIMAL(14,2) NOT NULL,
  "valorDesconto"  DECIMAL(14,2) NOT NULL DEFAULT 0,
  "valorFrete"     DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- ICMS
  "icmsCST"        TEXT,
  "icmsCSOSN"      TEXT,
  "icmsBC"         DECIMAL(14,2),
  "icmsAliquota"   DECIMAL(7,4),
  "icmsValor"      DECIMAL(14,2),
  -- ICMS-ST
  "icmsSTBC"       DECIMAL(14,2),
  "icmsSTMVA"      DECIMAL(7,4),
  "icmsSTAliquota" DECIMAL(7,4),
  "icmsSTValor"    DECIMAL(14,2),
  -- FCP
  "fcpAliquota"    DECIMAL(7,4),
  "fcpValor"       DECIMAL(14,2),
  -- IPI
  "ipiCST"         TEXT,
  "ipiCodEnq"      TEXT,
  "ipiAliquota"    DECIMAL(7,4),
  "ipiValor"       DECIMAL(14,2),
  -- PIS
  "pisCST"         TEXT,
  "pisBC"          DECIMAL(14,2),
  "pisAliquota"    DECIMAL(7,4),
  "pisValor"       DECIMAL(14,2),
  -- COFINS
  "cofinsCST"      TEXT,
  "cofinsBC"       DECIMAL(14,2),
  "cofinsAliquota" DECIMAL(7,4),
  "cofinsValor"    DECIMAL(14,2),
  -- Total tributos
  "totalTributos"  DECIMAL(14,2),
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotaFiscalItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotaFiscalItem_notaFiscalId_fkey"
    FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "NotaFiscalItem_notaFiscalId_idx" ON "NotaFiscalItem"("notaFiscalId");
CREATE INDEX IF NOT EXISTS "NotaFiscalItem_tenantId_idx"     ON "NotaFiscalItem"("tenantId");

-- ─── NotaFiscalPagamento ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "NotaFiscalPagamento" (
  "id"           TEXT          NOT NULL,
  "notaFiscalId" TEXT          NOT NULL,
  "forma"        TEXT          NOT NULL,
  "valor"        DECIMAL(14,2) NOT NULL,
  "bandeira"     TEXT,
  "cnpjCred"     TEXT,
  "tpIntegr"     TEXT,

  CONSTRAINT "NotaFiscalPagamento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotaFiscalPagamento_notaFiscalId_fkey"
    FOREIGN KEY ("notaFiscalId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "NotaFiscalPagamento_notaFiscalId_idx"
  ON "NotaFiscalPagamento"("notaFiscalId");
