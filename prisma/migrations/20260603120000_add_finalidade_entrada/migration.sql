-- Classificação de finalidade/destinação de itens em NF-e de entrada (revenda, uso/consumo,
-- imobilizado, industrialização). Determina CFOP de entrada, crédito recuperável e estoque.
CREATE TYPE "FinalidadeEntrada" AS ENUM ('REVENDA', 'USO_CONSUMO', 'IMOBILIZADO', 'INDUSTRIALIZACAO');

-- Item da entrada: finalidade efetiva + sugerida, origem da decisão, CFOP derivado e flag de estoque.
ALTER TABLE "EntradaFiscalItem" ADD COLUMN "finalidade" "FinalidadeEntrada";
ALTER TABLE "EntradaFiscalItem" ADD COLUMN "finalidadeSugerida" "FinalidadeEntrada";
ALTER TABLE "EntradaFiscalItem" ADD COLUMN "finalidadeOrigem" TEXT;
ALTER TABLE "EntradaFiscalItem" ADD COLUMN "cfopEntradaDerivado" TEXT;
ALTER TABLE "EntradaFiscalItem" ADD COLUMN "movimentaEstoque" BOOLEAN NOT NULL DEFAULT true;

-- Perfil fiscal do produto memoriza a finalidade para próximas entradas do mesmo item.
ALTER TABLE "ProdutoFiscal" ADD COLUMN "finalidadePadrao" "FinalidadeEntrada";

-- Regra De/Para configurável: NCM / CFOP de origem / fornecedor -> finalidade.
CREATE TABLE "RegraFinalidadeEntrada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT,
    "nome" TEXT NOT NULL,
    "finalidade" "FinalidadeEntrada" NOT NULL,
    "ncm" TEXT,
    "cfopOrigem" TEXT,
    "fornecedorId" TEXT,
    "prioridade" INTEGER NOT NULL DEFAULT 100,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "vigenciaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenciaFim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RegraFinalidadeEntrada_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RegraFinalidadeEntrada_tenantId_empresaId_ncm_idx" ON "RegraFinalidadeEntrada"("tenantId", "empresaId", "ncm");
CREATE INDEX "RegraFinalidadeEntrada_tenantId_empresaId_ativo_idx" ON "RegraFinalidadeEntrada"("tenantId", "empresaId", "ativo");
