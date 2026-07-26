import type { AgentTool } from "../../types";
import { criarGastoManual, lancarGastoNoFinanceiro } from "@/domains/expenses/application/gasto-use-cases";

export const registrarDespesa: AgentTool = {
  name: "registrar_despesa",
  description:
    "Registra uma despesa manual da empresa. AÇÃO FINANCEIRA: antes de chamar, mostre estabelecimento, categoria, data e valor e peça confirmação. Só chame com confirmar=true após o usuário responder CONFIRMAR. Por padrão cria o gasto confirmado sem movimentar banco; lancarFinanceiro=true cria e quita uma conta a pagar na conta bancária ativa.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      estabelecimento: { type: "string", description: "Fornecedor/estabelecimento da despesa." },
      documento: { type: "string", description: "CPF/CNPJ do estabelecimento (opcional)." },
      categoria: {
        type: "string",
        description: "Ex.: Alimentação, Combustível, Material/Insumos, Serviços, Água/Luz/Internet, Manutenção, Transporte, Impostos/Taxas ou Outros."
      },
      data: { type: "string", description: "Data no formato AAAA-MM-DD; padrão hoje." },
      valorTotal: { type: "number", description: "Valor total positivo." },
      formaPagamento: { type: "string", description: "Forma de pagamento (opcional)." },
      observacoes: { type: "string", description: "Observações (opcional)." },
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descricao: { type: "string" },
            quantidade: { type: "number" },
            valor: { type: "number" }
          },
          required: ["descricao", "valor"]
        }
      },
      lancarFinanceiro: {
        type: "boolean",
        description: "Se true, também cria e quita a conta a pagar, debitando a conta bancária ativa. Só use quando o usuário pedir explicitamente."
      },
      confirmar: { type: "boolean", description: "Obrigatório true após o usuário responder CONFIRMAR." }
    },
    required: ["estabelecimento", "categoria", "valorTotal", "confirmar"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    if (args.confirmar !== true) {
      return { ok: false, data: null, error: "Despesa não confirmada. Mostre estabelecimento, categoria, data e valor e peça o usuário responder CONFIRMAR." };
    }
    if (args.data && !/^\d{4}-\d{2}-\d{2}$/.test(String(args.data))) {
      return { ok: false, data: null, error: "Informe a data no formato AAAA-MM-DD." };
    }
    const itens = Array.isArray(args.itens) ? (args.itens as Array<Record<string, unknown>>) : [];
    try {
      const gasto = await criarGastoManual(scope, {
        estabelecimento: String(args.estabelecimento ?? ""),
        documento: args.documento ? String(args.documento) : null,
        categoria: String(args.categoria ?? "Outros"),
        data: args.data ? String(args.data) : null,
        valorTotal: Number(args.valorTotal),
        formaPagamento: args.formaPagamento ? String(args.formaPagamento) : null,
        observacoes: args.observacoes ? String(args.observacoes) : null,
        criadoPor: "AGENTE",
        itens: itens.map((item) => ({
          descricao: String(item.descricao ?? ""),
          quantidade: item.quantidade == null ? null : Number(item.quantidade),
          valor: Number(item.valor)
        }))
      });

      if (args.lancarFinanceiro === true) {
        try {
          const financeiro = await lancarGastoNoFinanceiro(scope, gasto.id);
          return {
            ok: true,
            data: {
              gastoId: gasto.id,
              contaPagarId: financeiro.contaPagarId,
              status: "CONFIRMADO",
              lancadoFinanceiro: true,
              mensagem: "Despesa registrada e debitada no financeiro."
            }
          };
        } catch (error) {
          return {
            ok: true,
            data: {
              gastoId: gasto.id,
              status: "CONFIRMADO",
              lancadoFinanceiro: false,
              aviso: `A despesa foi registrada, mas não foi lançada no financeiro: ${error instanceof Error ? error.message : "falha desconhecida"}.`
            }
          };
        }
      }
      return {
        ok: true,
        data: {
          gastoId: gasto.id,
          status: "CONFIRMADO",
          lancadoFinanceiro: false,
          mensagem: "Despesa registrada. Nenhuma conta bancária foi movimentada."
        }
      };
    } catch (error) {
      return { ok: false, data: null, error: error instanceof Error ? error.message : "Falha ao registrar a despesa." };
    }
  }
};
