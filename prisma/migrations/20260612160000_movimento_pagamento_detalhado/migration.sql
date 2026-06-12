-- Detalhe do pagamento no movimento financeiro (ex.: contas a pagar quitadas no cartão):
-- qual maquininha/cartão (reusa MaquinaCartao), bandeira e nº de parcelas (1 = à vista).
ALTER TABLE "MovimentoFinanceiro" ADD COLUMN "maquinaCartaoId" TEXT;
ALTER TABLE "MovimentoFinanceiro" ADD COLUMN "bandeira" TEXT;
ALTER TABLE "MovimentoFinanceiro" ADD COLUMN "parcelas" INTEGER;
