import type { runAgentTurn } from "./run-agent-turn";

/** Respostas operacionais precisam continuar legíveis mesmo quando a entrada veio por voz. */
export function responseNeedsText(
  result: Awaited<ReturnType<typeof runAgentTurn>>,
  response: string
): boolean {
  if (result.draft || result.novasMensagens.some((message) => message.papel === "TOOL")) return true;
  return /https?:\/\/|R\$\s*\d/i.test(response) || response.includes("```");
}
