CREATE TYPE "LeadComercialStatus" AS ENUM (
  'NOVO',
  'EM_CONVERSA',
  'QUALIFICADO',
  'DEMONSTRACAO',
  'TESTE',
  'PROPOSTA',
  'ASSINANTE',
  'NUTRICAO',
  'PERDIDO',
  'OPT_OUT'
);

CREATE TYPE "LeadComercialCanal" AS ENUM (
  'WHATSAPP',
  'INSTAGRAM',
  'CHAT_WEB',
  'INDICACAO',
  'LANDING_PAGE',
  'OUTRO'
);

CREATE TYPE "LeadInteracaoDirecao" AS ENUM ('ENTRADA', 'SAIDA', 'INTERNA');

CREATE TABLE "PlataformaAgenteComercial" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "ativo" BOOLEAN NOT NULL DEFAULT false,
  "nomeAgente" TEXT NOT NULL DEFAULT 'Especialista XERP',
  "numeroWhatsapp" TEXT,
  "whatsappInstanceId" TEXT,
  "whatsappTokenCripto" TEXT,
  "whatsappClientTokenCripto" TEXT,
  "webhookSecretCripto" TEXT,
  "openrouterApiKeyCripto" TEXT,
  "openrouterKeyFinal" TEXT,
  "modeloIa" TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
  "telefoneHumano" TEXT,
  "urlCadastro" TEXT NOT NULL DEFAULT '/cadastro?plano=chat',
  "precoMensal" DECIMAL(10,2) NOT NULL DEFAULT 97,
  "promptComplementar" TEXT,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlataformaAgenteComercial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlataformaLead" (
  "id" TEXT NOT NULL,
  "nome" TEXT,
  "empresa" TEXT,
  "cnpj" TEXT,
  "telefone" TEXT,
  "email" TEXT,
  "instagramUsername" TEXT,
  "segmento" TEXT,
  "cidade" TEXT,
  "uf" TEXT,
  "status" "LeadComercialStatus" NOT NULL DEFAULT 'NOVO',
  "canalOrigem" "LeadComercialCanal" NOT NULL DEFAULT 'OUTRO',
  "origem" TEXT,
  "campanha" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmContent" TEXT,
  "utmTerm" TEXT,
  "dorPrincipal" TEXT,
  "sistemaAtual" TEXT,
  "emiteNfe" BOOLEAN,
  "emiteNfce" BOOLEAN,
  "emiteNfse" BOOLEAN,
  "volumeNotasMes" INTEGER,
  "score" INTEGER NOT NULL DEFAULT 0,
  "observacoes" TEXT,
  "consentimento" BOOLEAN NOT NULL DEFAULT false,
  "consentimentoEm" TIMESTAMP(3),
  "optOutEm" TIMESTAMP(3),
  "precisaHumano" BOOLEAN NOT NULL DEFAULT false,
  "responsavelUsuarioId" TEXT,
  "tenantConvertidoId" TEXT,
  "ultimoContatoEm" TIMESTAMP(3),
  "proximoFollowupEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlataformaLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlataformaLeadInteracao" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "canal" "LeadComercialCanal" NOT NULL,
  "direcao" "LeadInteracaoDirecao" NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'MENSAGEM',
  "conteudo" TEXT NOT NULL,
  "externalMessageId" TEXT,
  "usuarioId" TEXT,
  "metadados" JSONB,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlataformaLeadInteracao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlataformaLead_status_atualizadoEm_idx"
  ON "PlataformaLead"("status", "atualizadoEm");
CREATE INDEX "PlataformaLead_telefone_idx" ON "PlataformaLead"("telefone");
CREATE INDEX "PlataformaLead_email_idx" ON "PlataformaLead"("email");
CREATE INDEX "PlataformaLead_canalOrigem_campanha_idx"
  ON "PlataformaLead"("canalOrigem", "campanha");
CREATE INDEX "PlataformaLead_proximoFollowupEm_idx"
  ON "PlataformaLead"("proximoFollowupEm");
CREATE INDEX "PlataformaLeadInteracao_leadId_criadoEm_idx"
  ON "PlataformaLeadInteracao"("leadId", "criadoEm");
CREATE UNIQUE INDEX "PlataformaLeadInteracao_canal_externalMessageId_key"
  ON "PlataformaLeadInteracao"("canal", "externalMessageId");

ALTER TABLE "PlataformaLeadInteracao"
  ADD CONSTRAINT "PlataformaLeadInteracao_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "PlataformaLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
