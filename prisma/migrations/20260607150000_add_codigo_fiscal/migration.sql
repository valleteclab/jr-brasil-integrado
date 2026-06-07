-- Códigos fiscais de referência GLOBAIS (CFOP, CST, CSOSN, Origem...).
CREATE TABLE "CodigoFiscal" (
    "tipo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodigoFiscal_pkey" PRIMARY KEY ("tipo", "codigo")
);
CREATE INDEX "CodigoFiscal_tipo_idx" ON "CodigoFiscal"("tipo");
