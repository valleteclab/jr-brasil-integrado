"use client";

import { useEffect, useRef } from "react";

export type RealtimeCanal = "caixa" | "expedicao" | "vendas" | "fiscal";

type RealtimeEvent = { canal: RealtimeCanal; ts: number };

/**
 * Assina o stream SSE (/api/erp/realtime) e dispara `onChange` quando chega um evento de um
 * dos `canais` ouvidos. O EventSource reconecta sozinho se a conexão cair; em ambientes sem
 * SSE, o componente deve manter um polling de fallback (intervalo maior).
 *
 * `onChange` é chamado com pequeno debounce para coalescer rajadas (ex.: várias vendas
 * seguidas) em um único refresh.
 */
export function useRealtime(canais: RealtimeCanal[], onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Estabiliza a lista de canais entre renders (evita reabrir o SSE à toa).
  const canaisKey = canais.join(",");

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const ouvidos = new Set(canaisKey.split(",").filter(Boolean));
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const source = new EventSource("/api/erp/realtime");

    source.onmessage = (e) => {
      let evt: RealtimeEvent | null = null;
      try {
        evt = JSON.parse(e.data) as RealtimeEvent;
      } catch {
        return;
      }
      if (!evt || !ouvidos.has(evt.canal)) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => onChangeRef.current(), 250);
    };

    // Erros de rede: o próprio EventSource tenta reconectar; não fazemos nada além de
    // deixar o polling de fallback do componente cobrir o intervalo.
    source.onerror = () => {};

    return () => {
      if (debounce) clearTimeout(debounce);
      source.close();
    };
  }, [canaisKey]);
}
