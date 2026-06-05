-- Tipo de negócio da empresa (VENDA, SERVICO, AMBOS). Define o modo de PDV recomendado
-- e quais módulos do menu são relevantes para o cliente do ERP.
CREATE TYPE "TipoNegocio" AS ENUM ('VENDA', 'SERVICO', 'AMBOS');

ALTER TABLE "Empresa" ADD COLUMN "tipoNegocio" "TipoNegocio" NOT NULL DEFAULT 'AMBOS';
