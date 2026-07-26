import { NextResponse } from "next/server";
import { sanitizeKokoroVoice } from "@/domains/ai/tts-voices";
import { authErrorStatus } from "@/lib/auth/http";
import { requireAdmin } from "@/lib/auth/session";
import { synthesizeKokoroSpeech } from "@/lib/tts/kokoro-client";

const PREVIEW_TEXT = "Olá! Eu sou a assistente do sistema, criada pela Valleteclab. Esta é uma demonstração da minha voz.";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json() as { voice?: string };
    const voice = sanitizeKokoroVoice(body.voice);
    const audio = await synthesizeKokoroSpeech(PREVIEW_TEXT, voice);

    if (!audio) {
      return NextResponse.json({ error: "O serviço de voz não está disponível." }, { status: 503 });
    }

    return new NextResponse(Uint8Array.from(audio).buffer, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="kokoro-${voice}.mp3"`,
        "Content-Type": "audio/mpeg"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível gerar a demonstração.";
    return NextResponse.json({ error: message }, { status: authErrorStatus(error, 400) });
  }
}
