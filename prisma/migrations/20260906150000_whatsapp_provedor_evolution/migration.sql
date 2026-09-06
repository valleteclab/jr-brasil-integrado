-- Provedor EVOLUTION ("XERP WhatsApp"): Evolution API hospedada por nós, uma instância por
-- empresa. Reaproveita as colunas existentes: instanceId = nome da instância (xerp-emp-*),
-- tokenCripto = token da instância e webhookSecret = segredo do webhook (ambos criptografados).
ALTER TYPE "ProvedorWhatsapp" ADD VALUE IF NOT EXISTS 'EVOLUTION';
