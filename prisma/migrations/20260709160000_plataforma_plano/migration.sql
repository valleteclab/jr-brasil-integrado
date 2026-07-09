-- Planos comerciais editaveis pelo dono do SaaS + assinatura Asaas por tenant.
CREATE TABLE "PlataformaPlano" (
  "codigo" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "precoMensal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "limiteNotasMes" INTEGER,
  "trialDias" INTEGER NOT NULL DEFAULT 7,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlataformaPlano_pkey" PRIMARY KEY ("codigo")
);

ALTER TABLE "Tenant" ADD COLUMN "assinaturaAsaasId" TEXT;

-- Seed dos planos iniciais (o dono edita em /admin/planos).
INSERT INTO "PlataformaPlano" ("codigo","nome","descricao","precoMensal","limiteNotasMes","trialDias","ativo","atualizadoEm") VALUES
  ('EMISSOR','Emissor de Notas','NF-e e NFS-e ilimitadas de recursos essenciais: emissao, clientes, produtos e painel Simples/MEI. Sem IA, WhatsApp e Telegram.',99.90,20,7,true,CURRENT_TIMESTAMP),
  ('COMPLETO','ERP Completo','Sistema completo: PDV, caixa, estoque, financeiro, fiscal, IA, WhatsApp e Telegram.',0,NULL,7,true,CURRENT_TIMESTAMP);
