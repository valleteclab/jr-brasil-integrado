-- Telefone do agente pode operar VÁRIAS empresas (contador multi-CNPJ) + empresa ativa por chat.
DROP INDEX "AgenteTelefone_telefone_key";
CREATE UNIQUE INDEX "AgenteTelefone_telefone_empresaId_key" ON "AgenteTelefone"("telefone", "empresaId");
CREATE INDEX "AgenteTelefone_telefone_idx" ON "AgenteTelefone"("telefone");
CREATE TABLE "ChatEmpresaAtiva" (
  "id" TEXT NOT NULL,
  "canal" TEXT NOT NULL,
  "chave" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "aguardandoSelecao" BOOLEAN NOT NULL DEFAULT false,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatEmpresaAtiva_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChatEmpresaAtiva_canal_chave_key" ON "ChatEmpresaAtiva"("canal", "chave");
