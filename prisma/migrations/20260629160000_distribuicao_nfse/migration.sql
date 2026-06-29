-- Distribuicao de NFS-e do Sistema Nacional (ADN).
CREATE TABLE "DistribuicaoNfseDocumento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "ambiente" "AmbienteFiscal" NOT NULL,
  "nsu" TEXT NOT NULL,
  "chaveAcesso" TEXT,
  "nNFSe" TEXT,
  "tipoDocumento" TEXT,
  "papel" TEXT,
  "emitenteDocumento" TEXT,
  "emitenteNome" TEXT,
  "tomadorDocumento" TEXT,
  "tomadorNome" TEXT,
  "valor" DECIMAL(14,2),
  "dataEmissao" TIMESTAMP(3),
  "notaFiscalId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RECEBIDO',
  "payload" JSONB,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DistribuicaoNfseDocumento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DistribuicaoNfseDocumento_tenantId_empresaId_nsu_key" ON "DistribuicaoNfseDocumento"("tenantId","empresaId","nsu");
CREATE INDEX "DistribuicaoNfseDocumento_tenantId_empresaId_chaveAcesso_idx" ON "DistribuicaoNfseDocumento"("tenantId","empresaId","chaveAcesso");
CREATE INDEX "DistribuicaoNfseDocumento_tenantId_empresaId_papel_idx" ON "DistribuicaoNfseDocumento"("tenantId","empresaId","papel");
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "nfseDistNsu" TEXT;
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "nfseDistSyncEm" TIMESTAMP(3);
