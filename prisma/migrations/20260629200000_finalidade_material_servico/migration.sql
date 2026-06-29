-- Finalidades de material para uso na prestacao de servico (ICMS = credita; ISS = nao credita).
ALTER TYPE "FinalidadeEntrada" ADD VALUE IF NOT EXISTS 'MATERIAL_SERVICO_ICMS';
ALTER TYPE "FinalidadeEntrada" ADD VALUE IF NOT EXISTS 'MATERIAL_SERVICO_ISS';
