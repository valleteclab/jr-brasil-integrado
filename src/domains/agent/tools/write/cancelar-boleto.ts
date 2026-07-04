import type { AgentTool } from "../../types";
import { baixarBoletoNoBanco } from "@/domains/finance/application/boleto-use-cases";

export const cancelarBoleto: AgentTool = {
  name: "cancelar_boleto",
  description:
    "Cancela (baixa no banco) o BOLETO de um título do contas a receber — ele deixa de ser pagável. Use o contaReceberId (de consultar_contas_receber). Confirme com o usuário antes. Não altera o título em si; se precisar, emita um novo boleto depois.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      contaReceberId: { type: "string", description: "Id do título cujo boleto será cancelado." },
      confirmar: { type: "boolean", description: "OBRIGATÓRIO true — só envie após o usuário confirmar." }
    },
    required: ["contaReceberId", "confirmar"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    if (args.confirmar !== true) {
      return { ok: false, data: null, error: "Cancelamento não confirmado. Confirme com o usuário e chame de novo com confirmar=true." };
    }
    const contaReceberId = String(args.contaReceberId ?? "");
    if (!contaReceberId) return { ok: false, data: null, error: "Informe o contaReceberId." };
    try {
      const boleto = await baixarBoletoNoBanco(scope, contaReceberId);
      return { ok: true, data: { status: boleto.status, mensagem: "Boleto cancelado no banco (não é mais pagável)." } };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao cancelar o boleto." };
    }
  }
};
