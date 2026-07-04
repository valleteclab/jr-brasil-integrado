import type { AgentTool } from "../../types";
import { enviarBoleto, enviarNotaFiscal } from "@/domains/comms/application/document-send-use-cases";

/**
 * Envia um BOLETO ou uma NOTA FISCAL ao cliente por WhatsApp e/ou e-mail (usa o contato do cadastro,
 * ou um telefone/e-mail informado). Reaproveita os use-cases de envio do ERP.
 */
export const enviarDocumento: AgentTool = {
  name: "enviar_documento",
  description:
    "Envia ao cliente, por WhatsApp e/ou e-mail, um BOLETO (informe contaReceberId) ou uma NOTA FISCAL (informe notaId). Usa o contato do cadastro; pode sobrepor com telefone/email. Ex.: após emitir_boleto ou faturar_pedido, envie o documento ao cliente.",
  mode: "write",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: ["boleto", "nota"], description: "O que enviar: 'boleto' ou 'nota'." },
      contaReceberId: { type: "string", description: "Id do título (quando tipo=boleto)." },
      notaId: { type: "string", description: "Id da nota fiscal (quando tipo=nota)." },
      canais: { type: "array", items: { type: "string", enum: ["WHATSAPP", "EMAIL"] }, description: "Canais de envio (padrão: WhatsApp)." },
      telefone: { type: "string", description: "WhatsApp do destinatário (opcional; padrão = contato do cliente)." },
      email: { type: "string", description: "E-mail do destinatário (opcional; padrão = contato do cliente)." }
    },
    required: ["tipo"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const tipo = args.tipo === "nota" ? "nota" : "boleto";
    const canaisRaw = Array.isArray(args.canais) ? (args.canais as string[]) : [];
    const canais = (canaisRaw.filter((c) => c === "WHATSAPP" || c === "EMAIL") as Array<"WHATSAPP" | "EMAIL">);
    const input = {
      canais: canais.length ? canais : (["WHATSAPP"] as Array<"WHATSAPP" | "EMAIL">),
      telefone: args.telefone ? String(args.telefone) : null,
      email: args.email ? String(args.email) : null
    };
    try {
      if (tipo === "boleto") {
        const id = String(args.contaReceberId ?? "");
        if (!id) return { ok: false, data: null, error: "Informe o contaReceberId do boleto a enviar." };
        const r = await enviarBoleto(scope, id, input);
        return { ok: true, data: r };
      }
      const id = String(args.notaId ?? "");
      if (!id) return { ok: false, data: null, error: "Informe o notaId da nota a enviar." };
      const r = await enviarNotaFiscal(scope, id, input);
      return { ok: true, data: r };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao enviar o documento." };
    }
  }
};
