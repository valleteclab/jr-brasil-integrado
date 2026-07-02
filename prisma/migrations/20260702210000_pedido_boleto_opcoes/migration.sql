-- Opcoes de boleto escolhidas no atendimento (conta/parcelas/datas), consumidas na confirmacao.
ALTER TABLE "PedidoVenda" ADD COLUMN "boletoOpcoes" JSONB;
