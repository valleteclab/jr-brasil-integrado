import type { AgentTool } from "../../types";
import { getFiscalNoteDetail } from "../../queries/fiscal-note-queries";

export const consultarNotaFiscal: AgentTool = {
  name: "consultar_nota_fiscal",
  description:
    "Consulta o detalhe completo de uma nota fiscal por notaId ou número: destinatário, valores, impostos, itens, eventos, protocolo e links de PDF/XML. Use consultar_notas_fiscais primeiro quando o usuário não souber qual nota.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      notaId: { type: "string", description: "Id interno retornado por consultar_notas_fiscais." },
      numero: { type: "string", description: "Número exato da NF-e, NFC-e ou NFS-e." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => ({
    ok: true,
    data: await getFiscalNoteDetail(scope, {
      notaId: args.notaId ? String(args.notaId) : undefined,
      numero: args.numero ? String(args.numero) : undefined
    })
  })
};
