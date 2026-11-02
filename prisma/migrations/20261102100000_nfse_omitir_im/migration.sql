-- Municipio sem informacoes complementares no CNC NFS-e: a IM do prestador nao pode ir no DPS.
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN IF NOT EXISTS "nfseOmitirImPrestador" BOOLEAN DEFAULT false;
