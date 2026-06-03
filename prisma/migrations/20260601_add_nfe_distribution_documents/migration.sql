-- Fila local de documentos recebidos pela Distribuição DF-e/NF-e da ACBr.
CREATE TABLE "DistribuicaoNfeDocumento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "acbrDocumentoId" TEXT NOT NULL,
    "acbrDistribuicaoId" TEXT,
    "ambiente" "AmbienteFiscal" NOT NULL,
    "nsu" TEXT,
    "schema" TEXT,
    "tipoDocumento" TEXT,
    "chaveAcesso" TEXT,
    "resumo" BOOLEAN,
    "tipoEvento" TEXT,
    "numeroProtocolo" TEXT,
    "tipoNfe" INTEGER,
    "valorNfe" DECIMAL(14,2),
    "dataEmissao" TIMESTAMP(3),
    "dataRecebimento" TIMESTAMP(3),
    "emitenteDocumento" TEXT,
    "emitenteNome" TEXT,
    "manifestacaoId" TEXT,
    "manifestacaoStatus" TEXT,
    "manifestacaoEvento" TEXT,
    "manifestadoEm" TIMESTAMP(3),
    "entradaFiscalId" TEXT,
    "xmlImportacaoId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'LISTADO',
    "ultimoErro" TEXT,
    "payload" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistribuicaoNfeDocumento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DistribuicaoNfeDocumento_tenantId_empresaId_acbrDocumentoId_key" ON "DistribuicaoNfeDocumento"("tenantId", "empresaId", "acbrDocumentoId");
CREATE INDEX "DistribuicaoNfeDocumento_tenantId_empresaId_chaveAcesso_idx" ON "DistribuicaoNfeDocumento"("tenantId", "empresaId", "chaveAcesso");
CREATE INDEX "DistribuicaoNfeDocumento_tenantId_empresaId_status_idx" ON "DistribuicaoNfeDocumento"("tenantId", "empresaId", "status");

ALTER TABLE "DistribuicaoNfeDocumento" ADD CONSTRAINT "DistribuicaoNfeDocumento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistribuicaoNfeDocumento" ADD CONSTRAINT "DistribuicaoNfeDocumento_entradaFiscalId_fkey" FOREIGN KEY ("entradaFiscalId") REFERENCES "EntradaFiscal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DistribuicaoNfeDocumento" ADD CONSTRAINT "DistribuicaoNfeDocumento_xmlImportacaoId_fkey" FOREIGN KEY ("xmlImportacaoId") REFERENCES "XmlImportacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
