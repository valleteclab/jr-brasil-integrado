-- Mensalidade em atraso (inadimplência da assinatura Asaas): aviso a partir de 3 dias e
-- bloqueio a partir de 7 dias de atraso são DERIVADOS ao vivo a partir de mensalidadeVencidaEm.
ALTER TABLE "Tenant" ADD COLUMN "mensalidadeVencidaEm" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "mensalidadeFaturaUrl" TEXT;
