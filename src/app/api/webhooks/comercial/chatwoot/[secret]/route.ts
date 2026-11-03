import { NextResponse } from "next/server";
import {
  chatwootEnabled,
  devolverParaHumanoChatwoot,
  enviarMensagemChatwoot,
  inboxAtendido,
  parseEventoChatwoot,
  segredoChatwootValido
} from "@/lib/chatwoot/chatwoot-client";
import { getCommercialAgentRuntime } from "@/domains/platform-sales/application/commercial-agent-config";
import { processCommercialWhatsappMessage } from "@/domains/platform-sales/runtime/process-commercial-whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

/** URL pública do sistema a partir dos headers do proxy (Traefik). */
function baseUrlDe(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return host ? `${proto}://${host}` : "";
}

/**
 * Webhook do agent bot do Chatwoot — o número oficial é do SISGOV e vive lá; o ERP entra como bot.
 *
 * O Chatwoot não assina o payload, então o segredo vai no PRÓPRIO CAMINHO da URL (mesma solução
 * já usada no webhook da Z-API) e é conferido em tempo constante.
 */
export async function POST(request: Request, { params }: { params: { secret: string } }) {
  if (!chatwootEnabled()) return NextResponse.json({ received: true });
  if (!segredoChatwootValido(params.secret)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    const bruto = await request.text();
    if (bruto.length > 512_000) return NextResponse.json({ error: "Corpo excede o limite." }, { status: 413 });
    let payload: unknown;
    try { payload = JSON.parse(bruto); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }

    const evento = parseEventoChatwoot(payload);
    if (!evento || !evento.telefone) return NextResponse.json({ received: true });
    if (!inboxAtendido(evento.inboxId)) return NextResponse.json({ received: true });
    if (!(await getCommercialAgentRuntime())?.ativo) return NextResponse.json({ received: true });

    // Áudio ainda não é transcrito por aqui: o Chatwoot serve a mídia com sessão própria. Em vez
    // de adivinhar, o agente pede o texto — e o atendente humano continua vendo o áudio no inbox.
    const mensagem = evento.conteudo || (evento.audioUrl
      ? "O contato enviou um áudio. Peça, educadamente, que escreva a dúvida em texto."
      : "");
    if (!mensagem) return NextResponse.json({ received: true });

    const r = await processCommercialWhatsappMessage({
      telefone: evento.telefone,
      mensagem,
      messageId: `cw:${evento.mensagemId ?? `${evento.conversationId}:${Date.now()}`}`,
      baseUrl: baseUrlDe(request) || null,
      nome: evento.nome,
      referral: evento.referral
        ? { sourceId: evento.referral.sourceId, titulo: evento.referral.titulo, sourceUrl: evento.referral.sourceUrl }
        : null,
      // A resposta volta DENTRO da conversa do Chatwoot, no mesmo fio que o time acompanha.
      responder: async (texto) => {
        await enviarMensagemChatwoot(evento.conversationId, texto);
      }
    });

    // O agente não assumiu (desligado, fora de escopo ou handoff): a conversa fica com o time.
    if (!r.handled) await devolverParaHumanoChatwoot(evento.conversationId, "mensagem fora do escopo do agente comercial");
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[chatwoot] falha ao processar webhook:", error instanceof Error ? error.message : error);
    return NextResponse.json({ received: true });
  }
}
