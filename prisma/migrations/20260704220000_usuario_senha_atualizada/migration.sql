-- Auditoria de segurança: registra quando o usuário trocou a senha por último.
ALTER TABLE "Usuario" ADD COLUMN "senhaAtualizadaEm" TIMESTAMP(3);
