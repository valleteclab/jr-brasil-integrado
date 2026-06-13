-- Config da empresa: permitir finalizar a venda direto no atendimento (sem caixa).
-- Padrão false — toda venda passa pelo caixa para receber o pagamento e emitir a nota.
ALTER TABLE "Empresa" ADD COLUMN "permiteVendaDiretaBalcao" BOOLEAN NOT NULL DEFAULT false;
