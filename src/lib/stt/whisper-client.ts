const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_AUDIO_BYTES = 6 * 1024 * 1024;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function endpoint(): string | null {
  const baseUrl = process.env.WHISPER_STT_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  const params = new URLSearchParams({
    task: "transcribe",
    language: "pt",
    output: "json",
    vad_filter: "true",
    encode: "true"
  });
  return `${baseUrl}/asr?${params.toString()}`;
}

export async function transcribeWhisperAudio(input: {
  audio: Buffer;
  filename: string;
  mimeType?: string | null;
}): Promise<string> {
  const url = endpoint();
  if (!url) throw new Error("Transcrição de áudio não está configurada.");

  const maxBytes = positiveInteger(process.env.WHISPER_STT_MAX_BYTES, DEFAULT_MAX_AUDIO_BYTES);
  if (!input.audio.length) throw new Error("O áudio recebido está vazio.");
  if (input.audio.length > maxBytes) throw new Error("O áudio excede o limite permitido.");

  const form = new FormData();
  form.append(
    "audio_file",
    new Blob([new Uint8Array(input.audio)], { type: input.mimeType?.trim() || "audio/ogg" }),
    input.filename || "mensagem.ogg"
  );

  const timeoutMs = positiveInteger(process.env.WHISPER_STT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const response = await fetch(url, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Whisper retornou HTTP ${response.status}${raw ? `: ${raw.slice(0, 300)}` : ""}.`);

  let transcript = raw;
  try {
    const parsed = JSON.parse(raw) as { text?: unknown };
    transcript = typeof parsed.text === "string" ? parsed.text : "";
  } catch {
    // Algumas versões podem devolver texto puro; ele continua válido.
  }
  const text = transcript.replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Não foi possível identificar fala no áudio.");
  return text;
}
