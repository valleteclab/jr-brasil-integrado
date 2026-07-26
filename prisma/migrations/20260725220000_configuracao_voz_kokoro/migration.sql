-- Voz do Kokoro escolhida por tenant/empresa.
ALTER TABLE "ConfiguracaoIa"
  ADD COLUMN "vozTts" TEXT NOT NULL DEFAULT 'pf_dora';
