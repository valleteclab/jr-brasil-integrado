-- Sangria/suprimento: quem lançou e estorno (o lançamento errado fica no histórico e sai das contas).
ALTER TABLE "CaixaMovimento" ADD COLUMN "usuarioId" TEXT;
ALTER TABLE "CaixaMovimento" ADD COLUMN "estornadoEm" TIMESTAMP(3);
ALTER TABLE "CaixaMovimento" ADD COLUMN "estornadoPorUsuarioId" TEXT;
ALTER TABLE "CaixaMovimento" ADD COLUMN "motivoEstorno" TEXT;
