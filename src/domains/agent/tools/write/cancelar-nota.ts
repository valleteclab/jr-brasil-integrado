import type { AgentTool } from "../../types";
import { cancelNotaFiscal } from "@/domains/fiscal/application/fiscal-emission-use-cases";

/**
 * Cancela uma nota fiscal AUTORIZADA na SEFAZ. Ação IRREVERSÍVEL e com prazo legal (NF-e 24h, NFC-e
 * ~30min). Exige justificativa (mín. 15 caracteres) e confirmar=true (após o usuário responder CANCELAR).
 */
export const cancelarNota: AgentTool = {
  name: "cancelar_nota",
  description:
    "Cancela uma NOTA FISCAL autorizada na SEFAZ (use consultar_pedido para achar o notaId). AÇÃO IRREVERSÍVEL e com prazo legal (NF-e 24h, NFC-e ~30min). Fluxo: 1) mostre a nota (número, cliente, valor); 2) peça o motivo e o usuário responder CANCELAR; 3) chame com confirmar=true e a justificativa (mín. 15 caracteres).",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      notaId: { type: "string", description: "Id da nota fiscal a cancelar." },
      justificativa: { type: "string", description: "Motivo do cancelamento (mínimo 15 caracteres, exigência da SEFAZ)." },
      confirmar: { type: "boolean", description: "OBRIGATÓRIO true — só envie após o usuário confirmar com CANCELAR." }
    },
    required: ["notaId", "justificativa", "confirmar"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    if (args.confirmar !== true) {
      return { ok: false, data: null, error: "Cancelamento não confirmado. Mostre a nota, peça o motivo e o usuário responder CANCELAR; então chame com confirmar=true." };
    }
    const notaId = String(args.notaId ?? "");
    const justificativa = String(args.justificativa ?? "").trim();
    if (!notaId) return { ok: false, data: null, error: "Informe o notaId." };
    if (justificativa.length < 15) return { ok: false, data: null, error: "A justificativa deve ter ao menos 15 caracteres (exigência da SEFAZ)." };
    try {
      const nota = await cancelNotaFiscal(scope, notaId, justificativa);
      return { ok: true, data: { status: nota.status, mensagem: "Nota cancelada na SEFAZ." } };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao cancelar a nota." };
    }
  }
};
