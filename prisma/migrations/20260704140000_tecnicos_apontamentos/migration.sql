-- Cadastro de TÉCNICOS + APONTAMENTOS de execução na OS + campos de técnico/KM na OS.

CREATE TABLE "Tecnico" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "especialidade" TEXT,
  "telefone" TEXT,
  "custoHora" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "usuarioId" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tecnico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tecnico_usuarioId_key" ON "Tecnico"("usuarioId");
CREATE INDEX "Tecnico_tenantId_empresaId_ativo_idx" ON "Tecnico"("tenantId", "empresaId", "ativo");
ALTER TABLE "Tecnico" ADD CONSTRAINT "Tecnico_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrdemServicoApontamento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "empresaId" TEXT NOT NULL,
  "ordemServicoId" TEXT NOT NULL,
  "tecnicoId" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "horas" DECIMAL(8,2),
  "statusMomento" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrdemServicoApontamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrdemServicoApontamento_tenantId_empresaId_ordemServicoId_idx"
  ON "OrdemServicoApontamento"("tenantId", "empresaId", "ordemServicoId");
ALTER TABLE "OrdemServicoApontamento" ADD CONSTRAINT "OrdemServicoApontamento_ordemServicoId_fkey"
  FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdemServicoApontamento" ADD CONSTRAINT "OrdemServicoApontamento_tecnicoId_fkey"
  FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrdemServico" ADD COLUMN "km" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN "tecnicoResponsavelId" TEXT;
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_tecnicoResponsavelId_fkey"
  FOREIGN KEY ("tecnicoResponsavelId") REFERENCES "Tecnico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrdemServicoMaoObra" ADD COLUMN "tecnicoId" TEXT;
ALTER TABLE "OrdemServicoMaoObra" ADD CONSTRAINT "OrdemServicoMaoObra_tecnicoId_fkey"
  FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
