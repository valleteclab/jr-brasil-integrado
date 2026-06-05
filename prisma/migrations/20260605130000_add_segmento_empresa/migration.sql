-- Segmento (ramo) da empresa. Ativa recursos específicos do catálogo (ex.: AUTOPECAS habilita
-- a aplicação veicular no cadastro de produto) sem poluir os demais segmentos.
CREATE TYPE "SegmentoEmpresa" AS ENUM ('GERAL', 'AUTOPECAS', 'MATERIAL_CONSTRUCAO', 'MERCADO');

ALTER TABLE "Empresa" ADD COLUMN "segmento" "SegmentoEmpresa" NOT NULL DEFAULT 'GERAL';
