import type { AgentTool } from "../../types";
import { listFiscalNotes } from "../../queries/fiscal-note-queries";

export const consultarNotasFiscais: AgentTool = {
  name: "consultar_notas_fiscais",
  description:
    "Lista e pesquisa notas fiscais da empresa ativa (NF-e, NFC-e e NFS-e), com notaId, número, destinatário, valor, data e status. Use quando pedirem notas emitidas, últimas notas ou uma nota por número/cliente. O resultado respeita o ambiente fiscal atual e pode ser filtrado por modelo, status, cliente e período.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      modelo: { type: "string", enum: ["NFE", "NFCE", "NFSE"], description: "Modelo fiscal opcional." },
      status: {
        type: "string",
        enum: ["RASCUNHO", "PROCESSANDO", "AUTORIZADA", "CANCELADA", "REJEITADA", "DENEGADA", "ERRO", "SUBSTITUIDA"],
        description: "Status opcional da nota."
      },
      cliente: { type: "string", description: "Nome, CPF ou CNPJ do destinatário (opcional)." },
      numero: { type: "string", description: "Número da nota ou chave de acesso, inteira ou parcial (opcional)." },
      periodoDias: { type: "number", description: "Somente notas criadas nos últimos N dias (opcional; sem valor pesquisa todo o histórico)." },
      limite: { type: "number", description: "Máximo de notas retornadas (padrão 20, máximo 50)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const data = await listFiscalNotes(scope, {
      modelo: args.modelo ? String(args.modelo) : undefined,
      status: args.status ? String(args.status) : undefined,
      cliente: args.cliente ? String(args.cliente) : undefined,
      numero: args.numero ? String(args.numero) : undefined,
      periodoDias: args.periodoDias == null ? undefined : Number(args.periodoDias),
      limite: args.limite == null ? undefined : Number(args.limite)
    });
    return { ok: true, data };
  }
};
