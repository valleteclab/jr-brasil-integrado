export const KOKORO_VOICES = [
  { id: "pf_dora", name: "Dora", description: "Voz feminina, clara e natural" },
  { id: "pm_alex", name: "Alex", description: "Voz masculina, firme e direta" },
  { id: "pm_santa", name: "Santa", description: "Voz masculina, mais encorpada" }
] as const;

export type KokoroVoiceId = (typeof KOKORO_VOICES)[number]["id"];

export const DEFAULT_KOKORO_VOICE: KokoroVoiceId = "pf_dora";

export function isKokoroVoiceId(value: unknown): value is KokoroVoiceId {
  return typeof value === "string" && KOKORO_VOICES.some((voice) => voice.id === value);
}

export function sanitizeKokoroVoice(value: unknown): KokoroVoiceId {
  if (!isKokoroVoiceId(value)) {
    throw new Error("Selecione uma voz disponível para o assistente.");
  }
  return value;
}
