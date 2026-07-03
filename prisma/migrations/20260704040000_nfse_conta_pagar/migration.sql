-- Importação da NFS-e recebida (tomador) como DESPESA: vínculo com a conta a pagar gerada.
ALTER TABLE "DistribuicaoNfseDocumento" ADD COLUMN "contaPagarId" TEXT;
