-- Credenciais por token (Spedy/Focus/NFe.io/PlugNotas/Webmania) no provedor da plataforma.
ALTER TABLE "PlataformaProvedorFiscal" ADD COLUMN "tokenCriptografado" TEXT;
ALTER TABLE "PlataformaProvedorFiscal" ADD COLUMN "tokenFinal" TEXT;

-- Configuração global: qual provedor de emissão está ativo.
CREATE TABLE "PlataformaConfiguracao" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provedorFiscalAtivo" TEXT NOT NULL DEFAULT 'ACBR',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlataformaConfiguracao_pkey" PRIMARY KEY ("id")
);
