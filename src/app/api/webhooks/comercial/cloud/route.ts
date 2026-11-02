import { NextResponse } from "next/server";
import {
  assinaturaCloudValida,
  baixarMidiaCloud,
  cloudApiConfig,
  cloudApiEnabled,
  marcarLidaCloud,
  parseWebhookCloud
} from "@/lib/whatsapp/cloud-api-client";
import { getCommercialAgentRuntime } from "@/domains/platform-sales/application/commercial-agent-config";
import { processCommercialWhatsappMessage } from "@/domains/platform-sales/runtime/process-commercial-whatsapp";
import { transcribeWhisperAudio } from "@/lib/stt/whisper-client";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

/** URL pública do sistema a partir dos headers do proxy (Traefik). */
function baseUrlDe(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return host ? `${proto}://${host}` : "";
}

/** Handshake de verificação da Meta: devolve o hub.challenge quando o verify token confere. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const { verifyToken } = cloudApiConfig();
  if (q.get("hub.mode") === "subscribe" && verifyToken && q.get("hub.verify_token") === verifyToken) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

/**
 * Mensagens recebidas no número oficial (Cloud API). A assinatura HMAC é conferida com o app
 * secret ANTES de qualquer processamento — o endpoint é público e a Meta é a única origem válida.
 */
export async function POST(request: Request) {
  if (!cloudApiEnabled()) return NextResponse.json({ received: true });
  try {
    const bruto = await request.text();
    if (bruto.length > 512_000) return NextResponse.json({ error: "Corpo excede o limite." }, { status: 413 });
    if (!assinaturaCloudValida(bruto, request.headers.get("x-hub-signature-256"))) {
      return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
    }

    let payload: unknown;
    try { payload = JSON.parse(bruto); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }

    const runtime = await getCommercialAgentRuntime();
    if (!runtime?.ativo) return NextResponse.json({ received: true });

    for (const m of parseWebhookCloud(payload)) {
      void marcarLidaCloud(m.messageId);

      let mensagem = m.texto;
      if (!mensagem && m.audio) {
        // Áudio do lead: baixa pela própria Graph (a URL exige o token) e transcreve no Whisper.
        const midia = await baixarMidiaCloud(m.audio.mediaId).catch(() => null);
        const texto = midia
          ? await transcribeWhisperAudio({ audio: midia.buffer, filename: "audio.ogg", mimeType: midia.mimeType }).catch(() => null)
          : null;
        mensagem = texto || "O lead enviou um áudio que não consegui ouvir. Peça para escrever ou repetir.";
      }
      if (!mensagem) continue;

      await processCommercialWhatsappMessage({
        telefone: m.telefone,
        mensagem,
        messageId: `cloud:${m.messageId}`,
        baseUrl: baseUrlDe(request) || null,
        referral: m.referral,
        nome: m.nome
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    // A Meta reenvia em erro; respondemos 200 para não entrar em loop de reentrega.
    console.error("[whatsapp/cloud] falha ao processar webhook:", error instanceof Error ? error.message : error);
    return NextResponse.json({ received: true });
  }
}
