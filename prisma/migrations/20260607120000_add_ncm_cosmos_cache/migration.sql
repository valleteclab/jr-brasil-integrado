-- Tabela oficial de NCM (referência global) para ancorar sugestões de NCM da IA.
CREATE TABLE "Ncm" (
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ncm_pkey" PRIMARY KEY ("codigo")
);
CREATE INDEX "Ncm_descricao_idx" ON "Ncm"("descricao");

-- Cache de consultas ao Cosmos por GTIN (global) para economizar a cota diária.
CREATE TABLE "CosmosCache" (
    "gtin" TEXT NOT NULL,
    "descricao" TEXT,
    "ncm" TEXT,
    "cest" TEXT,
    "marca" TEXT,
    "thumbnail" TEXT,
    "buscadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CosmosCache_pkey" PRIMARY KEY ("gtin")
);
