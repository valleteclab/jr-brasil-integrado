-- Credito presumido de ICMS por NCM na apuracao do SPED (bloco E).
-- Motivado pelo Decreto BA 23.481/2025 (informatica, 61,11% nas saidas internas), mas a regra
-- e generica: percentual, NCM e codigos de ajuste vem do cadastro de cada empresa.
ALTER TABLE "SpedConfiguracao"
  ADD COLUMN "creditoPresumidoAtivo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "creditoPresumidoPercentual" DECIMAL(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN "creditoPresumidoCodAjuste" TEXT,
  ADD COLUMN "creditoPresumidoCodEstorno" TEXT,
  ADD COLUMN "creditoPresumidoCodIncentivo" TEXT,
  ADD COLUMN "creditoPresumidoNcms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "creditoPresumidoCfops" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
