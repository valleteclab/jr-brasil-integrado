-- Cadastro de formas de pagamento (como se paga), opcionalmente vinculado a uma conta financeira.
CREATE TABLE "FormaPagamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'OUTRO',
    "contaBancariaId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormaPagamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormaPagamento_tenantId_empresaId_nome_key" ON "FormaPagamento"("tenantId", "empresaId", "nome");
CREATE INDEX "FormaPagamento_tenantId_empresaId_ativo_idx" ON "FormaPagamento"("tenantId", "empresaId", "ativo");

ALTER TABLE "FormaPagamento" ADD CONSTRAINT "FormaPagamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormaPagamento" ADD CONSTRAINT "FormaPagamento_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
