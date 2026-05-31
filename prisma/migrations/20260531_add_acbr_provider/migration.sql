-- Adiciona o provedor ACBr API ao enum ProvedorFiscal.
ALTER TYPE "ProvedorFiscal" ADD VALUE IF NOT EXISTS 'ACBR';
