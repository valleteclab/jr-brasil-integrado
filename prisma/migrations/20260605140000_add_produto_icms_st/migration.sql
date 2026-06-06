-- Marca de mercadoria com ICMS recolhido por substituição tributária (contribuinte substituído).
-- Memorizada na entrada para propagar à revenda (saída sem ICMS próprio, CFOP de ST).
ALTER TABLE "ProdutoFiscal" ADD COLUMN "icmsSt" BOOLEAN NOT NULL DEFAULT false;
