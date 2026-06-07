-- Coluna normalizada (sem HTML/acentos) para busca de NCM por palavra-chave.
ALTER TABLE "Ncm" ADD COLUMN "descricaoBusca" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS "Ncm_descricao_idx";
CREATE INDEX "Ncm_descricaoBusca_idx" ON "Ncm"("descricaoBusca");
