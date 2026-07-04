import type { AgentTool } from "../../types";
import { gerarBoletoParaRecebivel, listContasComCobranca } from "@/domains/finance/application/boleto-use-cases";

export const emitirBoleto: AgentTool = {
  name: "emitir_boleto",
  description:
    "Emite um BOLETO bancário para um título do contas a receber (use consultar_contas_receber para achar o contaReceberId). Registra o boleto no banco e devolve a linha digitável. Confirme com o gestor o cliente e o valor ANTES de emitir. Se contaBancariaId não for informada, usa a primeira conta com cobrança configurada.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      contaReceberId: { type: "string", description: "Id do título a cobrar (de consultar_contas_receber)." },
      contaBancariaId: { type: "string", description: "Id da conta bancária de cobrança (opcional; padrão = primeira configurada)." }
    },
    required: ["contaReceberId"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const contaReceberId = String(args.contaReceberId ?? "");
    if (!contaReceberId) return { ok: false, data: null, error: "Informe o contaReceberId." };

    let contaBancariaId = args.contaBancariaId ? String(args.contaBancariaId) : "";
    if (!contaBancariaId) {
      const contas = await listContasComCobranca(scope);
      if (!contas.length) {
        return { ok: false, data: null, error: "Nenhuma conta bancária com cobrança configurada (Configurações → Contas financeiras)." };
      }
      contaBancariaId = contas[0].id;
    }

    try {
      const boleto = await gerarBoletoParaRecebivel(scope, contaReceberId, { contaBancariaId });
      return {
        ok: true,
        data: {
          status: boleto.status,
          nossoNumero: boleto.nossoNumero,
          linhaDigitavel: boleto.linhaDigitavel,
          temPdf: Boolean(boleto.pdfBase64),
          valor: Number(boleto.valor),
          vencimento: boleto.vencimento.toISOString().slice(0, 10),
          // Link do PDF para reenviar ao cliente (rota autenticada do ERP).
          pdfUrl: `/api/erp/financeiro/contas-receber/${contaReceberId}/boleto/pdf`
        }
      };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao emitir o boleto." };
    }
  }
};
