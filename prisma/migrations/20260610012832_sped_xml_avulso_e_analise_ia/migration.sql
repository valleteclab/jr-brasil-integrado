-- AlterTable
ALTER TABLE "SpedArquivo" ADD COLUMN     "analiseIa" JSONB,
ADD COLUMN     "analiseIaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SpedXmlDocumento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "modelo" TEXT,
    "numero" TEXT,
    "serie" TEXT,
    "emitidaEm" TIMESTAMP(3),
    "competenciaAno" INTEGER NOT NULL,
    "competenciaMes" INTEGER NOT NULL,
    "emitenteDocumento" TEXT,
    "emitenteNome" TEXT,
    "destinatarioDocumento" TEXT,
    "destinatarioNome" TEXT,
    "valorTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "xml" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpedXmlDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpedXmlDocumento_tenantId_empresaId_competenciaAno_competen_idx" ON "SpedXmlDocumento"("tenantId", "empresaId", "competenciaAno", "competenciaMes");

-- CreateIndex
CREATE UNIQUE INDEX "SpedXmlDocumento_tenantId_empresaId_chaveAcesso_key" ON "SpedXmlDocumento"("tenantId", "empresaId", "chaveAcesso");

-- AddForeignKey
ALTER TABLE "SpedXmlDocumento" ADD CONSTRAINT "SpedXmlDocumento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
