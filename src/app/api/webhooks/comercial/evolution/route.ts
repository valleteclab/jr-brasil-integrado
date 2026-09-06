import { NextResponse } from "next/server";
import { commercialEvolutionConfig, commercialEvolutionEnabled, commercialEvolutionRequest, parseCommercialEvolutionInbound, validEvolutionSecret } from "@/lib/whatsapp/commercial-evolution";
import { getCommercialAgentRuntime } from "@/domains/platform-sales/application/commercial-agent-config";
import { processCommercialWhatsappMessage } from "@/domains/platform-sales/runtime/process-commercial-whatsapp";
import { transcribeWhisperAudio } from "@/lib/stt/whisper-client";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

export async function POST(request: Request) {
  if (!commercialEvolutionEnabled()) return NextResponse.json({ received: true });
  try {
    const config = commercialEvolutionConfig();
    if (!validEvolutionSecret(request.headers.get("x-webhook-secret"), config.webhookSecret)) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
    // Corpo limitado antes do parse; mídia é obtida somente pela API privada autenticada.
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Corpo ausente." }, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > 256_000) { await reader.cancel(); return NextResponse.json({ error: "Corpo excede o limite." }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    let payload: unknown;
    try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
    const inbound = parseCommercialEvolutionInbound(payload, config.instance);
    if (!inbound || !(await getCommercialAgentRuntime())?.ativo) return NextResponse.json({ received: true });
    // Serializa por contato entre réplicas. A interação tem externalMessageId único no banco.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`commercial:${inbound.phone}`}))`;
      const prior = await tx.plataformaLeadInteracao.findUnique({ where: { canal_externalMessageId: { canal: "WHATSAPP", externalMessageId: inbound.messageId } }, select: { conteudo: true } });
      let message = inbound.text;
      if (prior) message = prior.conteudo;
      if (inbound.audio && !prior) {
        if (inbound.audio.seconds > 60) message = "O lead enviou um áudio acima do limite de 60 segundos. Peça para enviar um áudio mais curto.";
        else {
          const media = await commercialEvolutionRequest<{ base64?: string; mimetype?: string }>("/chat/getBase64FromMediaMessage", { message: { key: inbound.audio.key }, convertToMp4: false });
          if (!media.base64 || media.base64.length > 8_388_608) throw new Error("Áudio inválido.");
          message = await transcribeWhisperAudio({ audio: Buffer.from(media.base64, "base64"), filename: "lead.ogg", mimeType: media.mimetype });
        }
      }
      if (!message) return;
      await processCommercialWhatsappMessage({ telefone: inbound.phone, mensagem: message, messageId: inbound.messageId, baseUrl: config.publicUrl });
    }, { timeout: 210_000, maxWait: 10_000 });
    return NextResponse.json({ received: true });
  } catch {
    console.error("[comercial/evolution] Falha no processamento da mensagem.");
    return NextResponse.json({ error: "Falha temporária no atendimento." }, { status: 503 });
  }
}
