-- Override do ambiente da NFS-e (null=auto-detecta via /nfse/cidades; true=nacional; false=padrao).
ALTER TABLE "ConfiguracaoFiscal" ADD COLUMN "nfseAmbienteNacional" BOOLEAN;
