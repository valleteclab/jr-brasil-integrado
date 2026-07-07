-- Modulo de credito (revenda de consultas de bureau): config de plataforma, carteira pre-paga por
-- tenant, recargas via Pix (Asaas) e historico/cache de consultas de credito.

CREATE TABLE "PlataformaCredito" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "asaasApiKeyCripto" TEXT,
  "asaasWalletId" TEXT,
  "asaasSandbox" BOOLEAN NOT NULL DEFAULT true,
  "asaasWebhookToken" TEXT,
  "apibrasilTokenCripto" TEXT,
  "apibrasilDevicePF" TEXT,
  "apibrasilDevicePJ" TEXT,
  "apibrasilSandbox" BOOLEAN NOT NULL DEFAULT true,
  "precoConsultaPF" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "precoConsultaPJ" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "validadeConsultaDias" INTEGER NOT NULL DEFAULT 60,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlataformaCredito_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CarteiraCredito" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "saldo" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "asaasCustomerId" TEXT,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CarteiraCredito_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CarteiraCredito_tenantId_key" ON "CarteiraCredito"("tenantId");

CREATE TABLE "RecargaCredito" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT,
  "valor" DECIMAL(14,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "asaasPaymentId" TEXT,
  "pixPayload" TEXT,
  "pixQrBase64" TEXT,
  "expiraEm" TIMESTAMP(3),
  "pagoEm" TIMESTAMP(3),
  "usuarioId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecargaCredito_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecargaCredito_asaasPaymentId_key" ON "RecargaCredito"("asaasPaymentId");
CREATE INDEX "RecargaCredito_tenantId_status_idx" ON "RecargaCredito"("tenantId", "status");

CREATE TABLE "ConsultaCredito" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT,
  "clienteId" TEXT,
  "documento" TEXT NOT NULL,
  "tipoPessoa" TEXT NOT NULL,
  "produto" TEXT NOT NULL,
  "custoRevenda" DECIMAL(10,2) NOT NULL,
  "score" INTEGER,
  "faixa" TEXT,
  "probabilidadeInadimplencia" DECIMAL(6,2),
  "decisao" TEXT,
  "limiteRecomendado" DECIMAL(14,2),
  "temRestricao" BOOLEAN NOT NULL DEFAULT false,
  "protocolo" TEXT,
  "pdfUrl" TEXT,
  "resultado" JSONB NOT NULL,
  "bruto" JSONB,
  "validoAte" TIMESTAMP(3),
  "usuarioId" TEXT,
  "consultadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsultaCredito_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConsultaCredito_tenantId_documento_idx" ON "ConsultaCredito"("tenantId", "documento");
CREATE INDEX "ConsultaCredito_clienteId_idx" ON "ConsultaCredito"("clienteId");
