import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function encryptionKey() {
  const source = process.env.AI_CONFIG_SECRET;

  if (!source) {
    throw new Error("AI_CONFIG_SECRET nao configurado. Defina a chave de criptografia para salvar credenciais de IA.");
  }

  return createHash("sha256").update(source).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");

  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Credencial de IA invalida ou corrompida.");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function secretLastChars(value: string, size = 4) {
  return value.slice(Math.max(0, value.length - size));
}
