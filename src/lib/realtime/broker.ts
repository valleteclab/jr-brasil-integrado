import { EventEmitter } from "node:events";
import type { TenantScope } from "@/lib/auth/dev-session";

/**
 * Broker de tempo real (sem Redis, sem WebSocket): um EventEmitter em memória que distribui
 * "avisos de mudança" para as conexões SSE abertas. Os eventos são SCOPED por tenant/empresa
 * — cada loja só enxerga os próprios —, e carregam apenas o nome do canal ("caixa",
 * "expedicao", "vendas"); o cliente reage recarregando os dados (router.refresh).
 *
 * Singleton via globalThis para sobreviver ao HMR do Next em dev e ser único por processo.
 *
 * Escala: vale para 1 processo Node (VPS com `next start`). Para 2+ instâncias, troque a
 * publicação/assinatura por Postgres LISTEN/NOTIFY (ou Redis pub/sub) mantendo esta interface.
 */

export type RealtimeCanal = "caixa" | "expedicao" | "vendas" | "fiscal";

export type RealtimeEvent = {
  canal: RealtimeCanal;
  /** Momento da emissão (epoch ms) — útil para o cliente ignorar eventos antigos. */
  ts: number;
};

const globalForBroker = globalThis as unknown as { realtimeBroker?: EventEmitter };

function getEmitter(): EventEmitter {
  if (!globalForBroker.realtimeBroker) {
    const emitter = new EventEmitter();
    // Muitas conexões SSE simultâneas (vários caixas/telas) — evita o aviso de leak do Node.
    emitter.setMaxListeners(0);
    globalForBroker.realtimeBroker = emitter;
  }
  return globalForBroker.realtimeBroker;
}

/** Chave de isolamento por cliente: nenhum evento cruza tenant/empresa. */
function scopeKey(scope: TenantScope): string {
  return `${scope.tenantId}:${scope.empresaId}`;
}

/**
 * Publica um aviso de mudança para um canal do escopo. NUNCA lança: notificação é best-effort
 * e jamais deve derrubar a operação de negócio que a disparou (envolva a chamada como quiser,
 * mas aqui já protegemos).
 */
export function publishRealtime(scope: TenantScope, canal: RealtimeCanal): void {
  try {
    getEmitter().emit(scopeKey(scope), { canal, ts: Date.now() } satisfies RealtimeEvent);
  } catch {
    // best-effort: silencioso de propósito
  }
}

/** Inscreve um ouvinte para o escopo. Retorna a função de cancelamento (chamar no close do SSE). */
export function subscribeRealtime(scope: TenantScope, listener: (event: RealtimeEvent) => void): () => void {
  const emitter = getEmitter();
  const key = scopeKey(scope);
  emitter.on(key, listener);
  return () => emitter.off(key, listener);
}
