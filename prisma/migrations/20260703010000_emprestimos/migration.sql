-- Contratos de EMPRÉSTIMO/FINANCIAMENTO (cronograma PRICE/SAC → parcelas no contas a pagar)
CREATE TABLE "Emprestimo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
    "tipo" TEXT NOT NULL DEFAULT 'EMPRESTIMO',
    "instituicao" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "numeroContrato" TEXT,
    "dataContratacao" TIMESTAMP(3) NOT NULL,
    "valorPrincipal" DECIMAL(14,2) NOT NULL,
    "taxaJurosMensal" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "sistemaAmortizacao" TEXT NOT NULL DEFAULT 'PRICE',
    "totalParcelas" INTEGER NOT NULL,
    "parcelasJaPagas" INTEGER NOT NULL DEFAULT 0,
    "valorParcela" DECIMAL(14,2),
    "primeiroVencimento" TIMESTAMP(3) NOT NULL,
    "contaBancariaId" TEXT,
    "classificacaoId" TEXT,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Emprestimo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Emprestimo_tenantId_empresaId_status_idx" ON "Emprestimo"("tenantId", "empresaId", "status");

ALTER TABLE "Emprestimo" ADD CONSTRAINT "Emprestimo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Emprestimo" ADD CONSTRAINT "Emprestimo_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Emprestimo" ADD CONSTRAINT "Emprestimo_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Emprestimo" ADD CONSTRAINT "Emprestimo_classificacaoId_fkey" FOREIGN KEY ("classificacaoId") REFERENCES "ClassificacaoFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vínculo da parcela do cronograma com o contrato
ALTER TABLE "ContaPagar" ADD COLUMN "emprestimoId" TEXT;
ALTER TABLE "ContaPagar" ADD COLUMN "emprestimoParcela" INTEGER;
CREATE INDEX "ContaPagar_tenantId_empresaId_emprestimoId_idx" ON "ContaPagar"("tenantId", "empresaId", "emprestimoId");
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_emprestimoId_fkey" FOREIGN KEY ("emprestimoId") REFERENCES "Emprestimo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
