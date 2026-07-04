-- Abertura de caixa passa a usar o usuário logado: guarda o id do usuário que abriu (rastreabilidade).
ALTER TABLE "Caixa" ADD COLUMN "operadorUsuarioId" TEXT;
