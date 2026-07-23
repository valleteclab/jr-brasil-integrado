-- Plano CHAT (chat-first): Emissor + assistente de IA + gastos por foto. Valores editáveis em /admin/planos.
INSERT INTO "PlataformaPlano" ("codigo", "nome", "descricao", "precoMensal", "limiteNotasMes", "franquiaIaMes", "trialDias", "ativo", "atualizadoEm")
VALUES ('CHAT', 'XERP Chat', 'Opere sua empresa pelo chat: emita NF-e/NFS-e, cobre por Pix/boleto e lance gastos por foto - com assistente de IA no Telegram e WhatsApp.', 97.00, NULL, 400, 7, true, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;
