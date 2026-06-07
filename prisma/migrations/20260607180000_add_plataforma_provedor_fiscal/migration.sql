-- Credenciais do provedor de emissão fiscal no nível da plataforma (dono do SaaS), por ambiente.
CREATE TABLE "PlataformaProvedorFiscal" (
    "provedor" TEXT NOT NULL,
    "ambiente" "AmbienteFiscal" NOT NULL,
    "baseUrl" TEXT,
    "clientIdCriptografado" TEXT,
    "clientSecretCriptografado" TEXT,
    "clientIdFinal" TEXT,
    "secretFinal" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlataformaProvedorFiscal_pkey" PRIMARY KEY ("provedor", "ambiente")
);
