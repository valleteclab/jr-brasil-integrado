-- Conta financeira (banco/caixa/cartão do cadastro) escolhida por parcela no lançamento da
-- entrada — copiada para a ContaPagar gerada (ContaPagar.contaBancariaId já existia).
ALTER TABLE "EntradaFiscalParcela" ADD COLUMN "contaBancariaId" TEXT;
