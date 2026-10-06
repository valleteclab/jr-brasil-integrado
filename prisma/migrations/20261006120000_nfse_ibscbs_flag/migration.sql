-- Reforma na NFS-e (NT 009 CGNFS-e): chave por empresa para enviar o grupo IBSCBS no DPS.
-- Nasce FALSE: nenhuma emissão muda até ligarem explicitamente na tela de configuração fiscal.
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "ibsCbsNfseAtivo" BOOLEAN NOT NULL DEFAULT false;
