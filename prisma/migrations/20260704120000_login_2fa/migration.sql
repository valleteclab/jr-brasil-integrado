-- 2FA no login (código via WhatsApp) + proteção contra força bruta.
ALTER TABLE "Usuario" ADD COLUMN "whatsapp" TEXT;
ALTER TABLE "Usuario" ADD COLUMN "loginFalhas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Usuario" ADD COLUMN "bloqueadoAte" TIMESTAMP(3);

-- Toggle do DONO DO SAAS por empresa: exigir código 2FA no login dos usuários da empresa.
ALTER TABLE "Empresa" ADD COLUMN "exigir2fa" BOOLEAN NOT NULL DEFAULT false;

-- Desafios 2FA pendentes (código de 6 dígitos com hash, validade curta, tentativas limitadas).
CREATE TABLE "Desafio2fa" (
  "id" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "codigoHash" TEXT NOT NULL,
  "expiraEm" TIMESTAMP(3) NOT NULL,
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "usadoEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Desafio2fa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Desafio2fa_usuarioId_idx" ON "Desafio2fa"("usuarioId");
ALTER TABLE "Desafio2fa" ADD CONSTRAINT "Desafio2fa_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
