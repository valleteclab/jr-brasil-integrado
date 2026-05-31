import type { AgentTool } from "../../types";
import { createSale } from "@/domains/sales/application/sale-use-cases";

export const criarPreVenda: AgentTool = {
  name: "criar_pre_venda",
  description:
    "Cria uma PRÉ-VENDA de balcão (status AGUARDANDO_PAGAMENTO) que vai para o Caixa receber o pagamento e emitir a nota. NÃO confirma, não baixa estoque nem emite nota — isso é feito por um humano no Caixa. clienteId é opcional (consumidor anônimo). Exige ao menos um item. Sempre confirme os itens antes de chamar.",
  mode: "write",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      clienteId: { type: "string", description: "Id do cliente (opcional; ausente = consumidor anônimo)." },
      itens: {
        type: "array",
        description: "Itens da venda.",
        items: {
          type: "object",
          properties: {
            produtoId: { type: "string" },
            quantidade: { type: "number" },
            precoUnitario: { type: "number" }
          },
          required: ["produtoId", "quantidade", "precoUnitario"]
        }
      },
      observacoes: { type: "string", description: "Observações (opcional)." }
    },
    required: ["itens"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const itens = Array.isArray(args.itens) ? (args.itens as Array<Record<string, unknown>>) : [];
    if (itens.length === 0) {
      return { ok: false, data: null, error: "Informe ao menos um item." };
    }
    const pedido = await createSale(scope, {
      clienteId: args.clienteId ? String(args.clienteId) : null,
      canal: "BALCAO",
      statusInicial: "AGUARDANDO_PAGAMENTO",
      observacoes: args.observacoes ? String(args.observacoes) : undefined,
      itens: itens.map((i) => ({
        produtoId: String(i.produtoId),
        quantidade: Number(i.quantidade),
        precoUnitario: Number(i.precoUnitario)
      }))
    });
    return {
      ok: true,
      data: { id: pedido.id, numero: pedido.numero, total: Number(pedido.total), status: pedido.status },
      draft: {
        tipo: "PEDIDO_VENDA",
        id: pedido.id,
        numero: pedido.numero,
        total: Number(pedido.total),
        href: "/erp/caixa"
      }
    };
  }
};
