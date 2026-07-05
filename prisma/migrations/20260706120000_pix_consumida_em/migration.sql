-- Pix pago aproveitado num recebimento do caixa/PDV (retomar venda parcialmente paga).
ALTER TABLE "PixCobranca" ADD COLUMN "consumidaEm" TIMESTAMP(3);
