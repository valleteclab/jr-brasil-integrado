import { NextResponse } from "next/server";
import { getCommercialAgentRuntime } from "@/domains/platform-sales/application/commercial-agent-config";
import { processCommercialWhatsappMessage } from "@/domains/platform-sales/runtime/process-commercial-whatsapp";
import { downloadRemoteAudio } from "@/lib/stt/remote-audio";
import { transcribeWhisperAudio } from "@/lib/stt/whisper-client";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

type ZapiCommercialInbound = {
  phone?: string;
  instanceId?: string;
  messageId?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  isNewsletter?: boolean;
  text?: { message?: string } | null;
  image?: { caption?: string } | null;
  audio?: { audioUrl?: string; mimeType?: string; seconds?: number } | null;
};

function publicBaseUrl(request: Request): string | null {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim();
  return host ? `${proto}://${host}` : null;
}

export async function POST(
  request: Request,
  context: { params: { secret: string } }
) {
  let body: ZapiCommercialInbound;
  try {
    body = (await request.json()) as ZapiCommercialInbound;
  } catch {
    return NextResponse.json({ received: true });
  }

  try {
    const config = await getCommercialAgentRuntime();
    if (
      !config?.ativo ||
      !config.webhookSecret ||
      context.params.secret !== config.webhookSecret ||
      !body.instanceId ||
      body.instanceId !== config.whatsappInstanceId
    ) {
      return NextResponse.json({ received: true });
    }
    if (body.fromMe || body.isGroup || body.isNewsletter || !body.phone) {
      return NextResponse.json({ received: true });
    }

    let message = body.text?.message?.trim() || body.image?.caption?.trim() || "";
    const audioUrl = body.audio?.audioUrl?.trim();
    if (audioUrl) {
      const maxSeconds = Number(process.env.WHISPER_STT_MAX_SECONDS || "60");
      if (body.audio?.seconds && Number.isFinite(maxSeconds) && body.audio.seconds > maxSeconds) {
        message = "O lead enviou um áudio acima do limite permitido.";
      } else {
        const remote = await downloadRemoteAudio(audioUrl);
        message = await transcribeWhisperAudio({
          audio: remote.buffer,
          filename: "lead-whatsapp.ogg",
          mimeType: body.audio?.mimeType || remote.mimeType
        });
      }
    }
    if (!message) return NextResponse.json({ received: true });

    await processCommercialWhatsappMessage({
      telefone: body.phone,
      mensagem: message,
      messageId: body.messageId,
      baseUrl: publicBaseUrl(request)
    });
  } catch (error) {
    console.error(
      "[webhook/comercial/whatsapp]",
      error instanceof Error ? error.message : "erro desconhecido"
    );
  }
  return NextResponse.json({ received: true });
}
