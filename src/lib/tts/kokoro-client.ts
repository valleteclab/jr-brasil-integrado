import { DEFAULT_KOKORO_VOICE, sanitizeKokoroVoice, type KokoroVoiceId } from "@/domains/ai/tts-voices";
const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function endpoint(): string | null {
  const baseUrl = process.env.KOKORO_TTS_URL?.trim().replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/v1/audio/speech` : null;
}

/**
 * Remove marcação visual que fica ruim quando narrada e limita o texto em um
 * ponto natural. O texto original enviado no Telegram não é alterado.
 */
export function prepareTextForSpeech(input: string): string {
  const maxChars = positiveInteger(process.env.KOKORO_TTS_MAX_CHARS, DEFAULT_MAX_CHARS);
  const normalized = input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/[*_#>|~]/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxChars) return normalized;
  const prefix = normalized.slice(0, maxChars);
  const naturalEnd = Math.max(prefix.lastIndexOf(". "), prefix.lastIndexOf("! "), prefix.lastIndexOf("? "));
  return `${(naturalEnd >= Math.floor(maxChars * 0.6) ? prefix.slice(0, naturalEnd + 1) : prefix).trim()}…`;
}

/**
 * Gera voz no Kokoro interno. MP3 continua como padrão dos canais móveis; o chat web pode pedir
 * WAV para evitar o encoder MP3 nativo em respostas maiores.
 */
export async function synthesizeKokoroSpeech(
  text: string,
  selectedVoice?: KokoroVoiceId,
  options?: { responseFormat?: "mp3" | "wav" }
): Promise<Buffer | null> {
  const url = endpoint();
  const input = prepareTextForSpeech(text);
  if (!url || !input) return null;
  const responseFormat = options?.responseFormat ?? "mp3";

  const timeoutMs = positiveInteger(process.env.KOKORO_TTS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      input,
      voice: selectedVoice ?? (
        process.env.KOKORO_TTS_VOICE?.trim()
          ? sanitizeKokoroVoice(process.env.KOKORO_TTS_VOICE.trim())
          : DEFAULT_KOKORO_VOICE
      ),
      response_format: responseFormat,
      // Andamento da fala (1 = natural). Configurável por env — ex.: 1.2 deixa o assistente mais ágil.
      speed: (() => {
        const s = Number(process.env.KOKORO_TTS_SPEED);
        return Number.isFinite(s) && s >= 0.5 && s <= 2 ? s : 1;
      })()
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Kokoro retornou HTTP ${response.status}${detail ? `: ${detail}` : ""}.`);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("audio/")) throw new Error(`Kokoro retornou conteúdo inválido (${contentType || "sem tipo"}).`);

  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error("Kokoro retornou áudio vazio.");
  if (audio.length > MAX_AUDIO_BYTES) throw new Error("Áudio do Kokoro excedeu o limite interno de 10 MB.");
  return audio;
}
