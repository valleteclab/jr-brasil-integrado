"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Recarrega os dados vindos do servidor depois de uma alteração, sem F5 e sem perder a tela.
 *
 * As telas do ERP atualizam o estado local depois de gravar (resposta otimista), o que deixa a
 * linha alterada certa mas o RESTO da página velho: totais, saldo da conta, contadores das abas,
 * e qualquer coisa que outra pessoa tenha mudado. `router.refresh()` refaz só a parte servidor,
 * preservando o que o usuário digitou nos campos abertos.
 *
 *   const revalidar = useRevalidar();
 *   await salvar();
 *   revalidar();
 */
export function useRevalidar(): () => void {
  const router = useRouter();
  return useCallback(() => {
    router.refresh();
  }, [router]);
}
