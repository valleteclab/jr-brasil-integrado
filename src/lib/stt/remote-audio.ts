import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function privateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) return privateAddress(normalized.slice(7));

  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && parts[2] === 100))) ||
    (a === 203 && b === 0 && parts[2] === 113)
  );
}

async function assertPublicHttps(input: string): Promise<URL> {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("A URL do áudio não é HTTPS válida.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("A origem do áudio não é permitida.");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) {
    throw new Error("A origem do áudio não é pública.");
  }
  return url;
}

/**
 * Baixa mídia indicada pelo provedor sem permitir acesso à rede privada da VPS.
 * O arquivo fica apenas em memória durante a transcrição.
 */
export async function downloadRemoteAudio(input: string): Promise<{ buffer: Buffer; mimeType: string | null }> {
  const timeoutMs = positiveInteger(process.env.WHISPER_STT_DOWNLOAD_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxBytes = positiveInteger(process.env.WHISPER_STT_MAX_BYTES, DEFAULT_MAX_AUDIO_BYTES);
  let current = input;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const url = await assertPublicHttps(current);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "audio/*,application/octet-stream;q=0.8" }
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Redirecionamento inválido ao baixar o áudio.");
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`Não foi possível baixar o áudio (HTTP ${response.status}).`);

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || null;
    if (contentType && !contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
      throw new Error("A mídia recebida não é um áudio válido.");
    }
    const declaredSize = Number(response.headers.get("content-length") || "0");
    if (declaredSize > maxBytes) throw new Error("O áudio excede o limite permitido.");

    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("O áudio excede o limite permitido.");
      }
      chunks.push(Buffer.from(value));
    }
    if (!total) throw new Error("O áudio recebido está vazio.");
    return {
      buffer: Buffer.concat(chunks, total),
      mimeType: contentType
    };
  }
  throw new Error("Não foi possível baixar o áudio.");
}
