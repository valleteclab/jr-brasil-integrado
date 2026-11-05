"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Recarrega os dados do servidor quando a aba volta a ficar visível.
 *
 * As telas do ERP são Server Components: os dados são lidos uma vez, na abertura. Quem deixava a
 * aba aberta via informação velha e precisava apertar F5 — foi o que fez um cliente tentar baixar
 * duas vezes uma conta já quitada (a lista ainda mostrava "vencido") e receber um erro confuso.
 *
 * Fica montado no layout do ERP, então vale para o sistema inteiro. Não é polling: só dispara
 * quando a pessoa volta para a aba, e respeita um intervalo mínimo para não recarregar à toa
 * em quem alterna de janela o tempo todo.
 */
export function RevalidarAutomatico({ intervaloMinimoMs = 10_000 }: { intervaloMinimoMs?: number }) {
  const router = useRouter();
  const ultimaRef = useRef(Date.now());

  useEffect(() => {
    function revalidarSeVisivel() {
      if (document.visibilityState !== "visible") return;
      const agora = Date.now();
      if (agora - ultimaRef.current < intervaloMinimoMs) return;
      ultimaRef.current = agora;
      router.refresh();
    }

    document.addEventListener("visibilitychange", revalidarSeVisivel);
    window.addEventListener("focus", revalidarSeVisivel);
    return () => {
      document.removeEventListener("visibilitychange", revalidarSeVisivel);
      window.removeEventListener("focus", revalidarSeVisivel);
    };
  }, [router, intervaloMinimoMs]);

  return null;
}
