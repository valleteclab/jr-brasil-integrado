-- Empresa MISTA no Simples (comércio + serviços): anexo próprio para a receita de SERVIÇOS
-- (NFS-e) — no PGDAS-D revenda vai pelo Anexo I/II e serviços pelo III/IV/V.
ALTER TABLE "Empresa" ADD COLUMN "simplesAnexoServicos" INTEGER;
