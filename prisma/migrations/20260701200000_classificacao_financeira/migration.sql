-- Classificação financeira gerencial (plano de contas do financeiro) + orçamento mensal (IDEAL),
-- e vínculo opcional em ContaPagar/ContaReceber para os relatórios por classificação.
CREATE TYPE "TipoClassificacaoFinanceira" AS ENUM ('DESPESA', 'RECEITA');

CREATE TABLE "ClassificacaoFinanceira" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "codigo" TEXT,
  "nome" TEXT NOT NULL,
  "grupo" TEXT NOT NULL,
  "tipo" "TipoClassificacaoFinanceira" NOT NULL DEFAULT 'DESPESA',
  "orcamentoMensal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClassificacaoFinanceira_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassificacaoFinanceira_tenantId_empresaId_nome_key"
  ON "ClassificacaoFinanceira"("tenantId", "empresaId", "nome");
CREATE INDEX "ClassificacaoFinanceira_tenantId_empresaId_grupo_idx"
  ON "ClassificacaoFinanceira"("tenantId", "empresaId", "grupo");

ALTER TABLE "ClassificacaoFinanceira" ADD CONSTRAINT "ClassificacaoFinanceira_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContaPagar" ADD COLUMN "classificacaoId" TEXT;
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_classificacaoId_fkey"
  FOREIGN KEY ("classificacaoId") REFERENCES "ClassificacaoFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ContaPagar_tenantId_empresaId_classificacaoId_idx"
  ON "ContaPagar"("tenantId", "empresaId", "classificacaoId");

ALTER TABLE "ContaReceber" ADD COLUMN "classificacaoId" TEXT;
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_classificacaoId_fkey"
  FOREIGN KEY ("classificacaoId") REFERENCES "ClassificacaoFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ContaReceber_tenantId_empresaId_classificacaoId_idx"
  ON "ContaReceber"("tenantId", "empresaId", "classificacaoId");
