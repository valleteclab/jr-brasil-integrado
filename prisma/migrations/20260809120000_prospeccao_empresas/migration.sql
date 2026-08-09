CREATE TABLE "ProspeccaoEmpresa" (
  "cnpj" TEXT NOT NULL,
  "nomeFantasia" TEXT,
  "cnae" TEXT NOT NULL,
  "uf" TEXT NOT NULL,
  "municipioTom" TEXT,
  "telefone" TEXT,
  "email" TEXT,
  "dataInicio" TEXT,
  "matriz" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProspeccaoEmpresa_pkey" PRIMARY KEY ("cnpj")
);
CREATE INDEX "ProspeccaoEmpresa_uf_cnae_idx" ON "ProspeccaoEmpresa"("uf", "cnae");
CREATE TABLE "ProspeccaoMunicipio" (
  "codigo" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  CONSTRAINT "ProspeccaoMunicipio_pkey" PRIMARY KEY ("codigo")
);
