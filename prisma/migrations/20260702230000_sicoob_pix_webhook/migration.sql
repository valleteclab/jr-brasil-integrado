-- Webhook de liquidação da cobrança Sicoob (baixa em tempo real) por conta bancária
ALTER TABLE "ContaBancaria" ADD COLUMN "sicoobWebhookId" INTEGER;
ALTER TABLE "ContaBancaria" ADD COLUMN "sicoobWebhookSecret" TEXT;

-- Cobrança PIX dinâmica (QR Code) na API Pix do Sicoob
CREATE TABLE "PixCobranca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ambiente" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
    "contaBancariaId" TEXT NOT NULL,
    "contaReceberId" TEXT,
    "pedidoVendaId" TEXT,
    "txid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "valor" DECIMAL(14,2) NOT NULL,
    "chave" TEXT NOT NULL,
    "brcode" TEXT,
    "descricao" TEXT,
    "expiracaoSeg" INTEGER NOT NULL DEFAULT 3600,
    "e2eid" TEXT,
    "pagoEm" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "payload" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixCobranca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PixCobranca_contaReceberId_key" ON "PixCobranca"("contaReceberId");
CREATE UNIQUE INDEX "PixCobranca_txid_key" ON "PixCobranca"("txid");
CREATE INDEX "PixCobranca_tenantId_empresaId_status_idx" ON "PixCobranca"("tenantId", "empresaId", "status");
CREATE INDEX "PixCobranca_tenantId_empresaId_pedidoVendaId_idx" ON "PixCobranca"("tenantId", "empresaId", "pedidoVendaId");

ALTER TABLE "PixCobranca" ADD CONSTRAINT "PixCobranca_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PixCobranca" ADD CONSTRAINT "PixCobranca_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
