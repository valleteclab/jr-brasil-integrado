-- Tabelas de referência GLOBAIS (compartilhadas por todas as empresas).
CREATE TABLE "CategoriaPadrao" (
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoriaPadrao_pkey" PRIMARY KEY ("slug")
);

CREATE TABLE "UnidadeMedida" (
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnidadeMedida_pkey" PRIMARY KEY ("codigo")
);
