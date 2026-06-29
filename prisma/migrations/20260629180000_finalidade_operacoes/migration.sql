-- Novas finalidades de entrada (operacoes de NF-e): devolucao de venda, transferencia,
-- retorno de industrializacao e bonificacao.
ALTER TYPE "FinalidadeEntrada" ADD VALUE IF NOT EXISTS 'DEVOLUCAO_VENDA';
ALTER TYPE "FinalidadeEntrada" ADD VALUE IF NOT EXISTS 'TRANSFERENCIA';
ALTER TYPE "FinalidadeEntrada" ADD VALUE IF NOT EXISTS 'RETORNO_INDUSTRIALIZACAO';
ALTER TYPE "FinalidadeEntrada" ADD VALUE IF NOT EXISTS 'BONIFICACAO';
