import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { baixarMidiaEvolution, evolutionOperacionalDisponivel, parseEvolutionInbound, validEvolutionWebhookSecret } from "@/lib/whatsapp/evolution-client";
import { getWhatsappRuntime } from "@/lib/whatsapp/whatsapp-service";
import { processWhatsappMessage } from "@/domains/agent/runtime/process-whatsapp-message";
import { processWhatsappReceipt } from "@/domains/expenses/runtime/process-whatsapp-receipt";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

/**
 * Webhook do XERP WhatsApp (Evolution) das EMPRESAS. A instância do payload (xerp-emp-*) aponta a
 * empresa; o segredo do header tem que bater com o dela. Depois disso é o MESMO fluxo do Z-API:
 * texto/áudio → agente (processWhatsappMessage); foto → cupom de gasto (processWhatsappReceipt).
 * Mídia é baixada pela API autenticada da Evolution, nunca por URL pública. Sempre responde 200
 * (exceto segredo inválido) e absorve erros para evitar reentregas.
 */
const TTL_MS = 30 * 60 * 1000;
const recebidas = new Map<string, number>();

function duplicada(id: string): boolean {
  const agora = Date.now();
  if (recebidas.size > 500) for (const [k, exp] of recebidas) if (exp <= agora) recebidas.delete(k);
  const exp = recebidas.get(id);
  if (exp && exp > agora) return true;
  recebidas.set(id, agora + TTL_MS);
  return false;
}

async function lerCorpo(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.length;
    if (size > 256_000) { await reader.cancel(); return null; }
    chunks.push(chunk.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}

export async function POST(request: Request) {
  if (!evolutionOperacionalDisponivel()) return NextResponse.json({ received: true });
  const inbound = parseEvolutionInbound(await lerCorpo(request));
  if (!inbound) return NextResponse.json({ received: true });
  try {
    const dona = await prisma.configuracaoWhatsapp.findFirst({
      where: { instanceId: inbound.instance, provedor: "EVOLUTION" },
      select: { tenantId: true, empresaId: true }
    });
    if (!dona) return NextResponse.json({ received: true });
    const whats = await getWhatsappRuntime({ tenantId: dona.tenantId, empresaId: dona.empresaId });
    if (!whats || !validEvolutionWebhookSecret(request.headers.get("x-webhook-secret"), whats.webhookSecret)) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
    if (!whats.ativo || duplicada(inbound.messageId)) return NextResponse.json({ received: true });

    const baseUrl = process.env.ERP_BASE?.replace(/\/+$/, "") || null;
    if (inbound.image) {
      const midia = await baixarMidiaEvolution(whats, inbound.image.key);
      if (midia) {
        await processWhatsappReceipt({ telefone: inbound.phone, imagemBase64: `data:${midia.mimeType || "image/jpeg"};base64,${midia.buffer.toString("base64")}` });
      }
    } else if (inbound.audio) {
      // Acima do limite não baixa: o agente responde a orientação de duração pelo campo seconds.
      const maxSeconds = Number(process.env.WHISPER_STT_MAX_SECONDS || "60");
      const midia = inbound.audio.seconds > maxSeconds ? null : await baixarMidiaEvolution(whats, inbound.audio.key);
      await processWhatsappMessage({
        telefone: inbound.phone,
        instanceId: inbound.instance,
        audio: { buffer: midia?.buffer ?? null, mimeType: midia?.mimeType ?? null, seconds: inbound.audio.seconds },
        baseUrl
      });
    } else if (inbound.text) {
      await processWhatsappMessage({ telefone: inbound.phone, texto: inbound.text, instanceId: inbound.instance, baseUrl });
    }
  } catch (error) {
    console.error("[webhook/whatsapp/evolution] falha ao processar:", error instanceof Error ? error.message : "erro desconhecido");
  }
  return NextResponse.json({ received: true });
}
