import type { AgentTool } from "../../types";
import { createQuote } from "@/domains/sales-quote/application/quote-use-cases";

export const criarOrcamento: AgentTool = {
  name: "criar_orcamento",
  description:
    "Cria um ORÇAMENTO em rascunho (status EM_ANALISE) para um cliente. Exige clienteId e ao menos um item (produtoId, quantidade, precoUnitario). NÃO aprova nem converte em pedido — um humano faz isso na tela de Orçamentos. Sempre confirme cliente e itens antes de chamar.",
  mode: "write",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      clienteId: { type: "string", description: "Id do cliente (use consultar_cliente para obter)." },
      itens: {
        type: "array",
        description: "Itens do orçamento.",
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
      validadeDias: { type: "number", description: "Validade em dias (opcional)." },
      condicaoPagamento: { type: "string", description: "Condição de pagamento (opcional)." },
      observacaoVendedor: { type: "string", description: "Observação do vendedor (opcional)." }
    },
    required: ["clienteId", "itens"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const itens = Array.isArray(args.itens) ? (args.itens as Array<Record<string, unknown>>) : [];
    if (!args.clienteId || itens.length === 0) {
      return { ok: false, data: null, error: "Informe clienteId e ao menos um item." };
    }
    const orcamento = await createQuote(scope, {
      clienteId: String(args.clienteId),
      itens: itens.map((i) => ({
        produtoId: String(i.produtoId),
        quantidade: Number(i.quantidade),
        precoUnitario: Number(i.precoUnitario)
      })),
      validadeDias: typeof args.validadeDias === "number" ? args.validadeDias : undefined,
      condicaoPagamento: args.condicaoPagamento ? String(args.condicaoPagamento) : undefined,
      observacaoVendedor: args.observacaoVendedor ? String(args.observacaoVendedor) : undefined
    });
    return {
      ok: true,
      data: { id: orcamento.id, numero: orcamento.numero, total: Number(orcamento.total), status: orcamento.status },
      draft: {
        tipo: "ORCAMENTO",
        id: orcamento.id,
        numero: orcamento.numero,
        total: Number(orcamento.total),
        href: "/erp/orcamentos"
      }
    };
  }
};
