-- CEST (Código Especificador da Substituição Tributária) GLOBAL, com NCMs associados.
CREATE TABLE "Cest" (
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ncms" TEXT[] NOT NULL DEFAULT '{}',
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cest_pkey" PRIMARY KEY ("codigo")
);

-- Municípios do IBGE GLOBAL.
CREATE TABLE "Municipio" (
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Municipio_pkey" PRIMARY KEY ("codigo")
);
CREATE INDEX "Municipio_uf_idx" ON "Municipio"("uf");
CREATE INDEX "Municipio_nome_idx" ON "Municipio"("nome");
