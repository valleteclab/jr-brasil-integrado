-- Cadastro completo de fornecedor: IE, endereço detalhado e observações.
ALTER TABLE "Fornecedor" ADD COLUMN "inscricaoEstadual" TEXT;
ALTER TABLE "Fornecedor" ADD COLUMN "cep" TEXT;
ALTER TABLE "Fornecedor" ADD COLUMN "logradouro" TEXT;
ALTER TABLE "Fornecedor" ADD COLUMN "numero" TEXT;
ALTER TABLE "Fornecedor" ADD COLUMN "complemento" TEXT;
ALTER TABLE "Fornecedor" ADD COLUMN "bairro" TEXT;
ALTER TABLE "Fornecedor" ADD COLUMN "observacoes" TEXT;
