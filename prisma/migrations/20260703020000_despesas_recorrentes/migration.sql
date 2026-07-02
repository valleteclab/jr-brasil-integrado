-- DESPESAS RECORRENTES (folha, aluguel, energia...) geradas por competência no contas a pagar
CREATE TABLE "DespesaRecorrente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
    "descricao" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "valorVariavel" BOOLEAN NOT NULL DEFAULT false,
    "periodicidade" TEXT NOT NULL DEFAULT 'MENSAL',
    "diaVencimento" INTEGER NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "contaBancariaId" TEXT,
    "classificacaoId" TEXT,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DespesaRecorrente_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DespesaRecorrente_tenantId_empresaId_status_idx" ON "DespesaRecorrente"("tenantId", "empresaId", "status");

ALTER TABLE "DespesaRecorrente" ADD CONSTRAINT "DespesaRecorrente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DespesaRecorrente" ADD CONSTRAINT "DespesaRecorrente_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DespesaRecorrente" ADD CONSTRAINT "DespesaRecorrente_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DespesaRecorrente" ADD CONSTRAINT "DespesaRecorrente_classificacaoId_fkey" FOREIGN KEY ("classificacaoId") REFERENCES "ClassificacaoFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vínculo da ocorrência gerada (idempotência por recorrência + competência "AAAA-MM")
ALTER TABLE "ContaPagar" ADD COLUMN "recorrenciaId" TEXT;
ALTER TABLE "ContaPagar" ADD COLUMN "recorrenciaCompetencia" TEXT;
CREATE INDEX "ContaPagar_tenantId_empresaId_recorrenciaId_idx" ON "ContaPagar"("tenantId", "empresaId", "recorrenciaId");
CREATE UNIQUE INDEX "ContaPagar_recorrenciaId_recorrenciaCompetencia_key" ON "ContaPagar"("recorrenciaId", "recorrenciaCompetencia");
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "DespesaRecorrente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
