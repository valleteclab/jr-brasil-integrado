import type { AgentTool } from "../../types";
import { createSale } from "@/domains/sales/application/sale-use-cases";
import { resolverCliente, resolverItens, type ItemRef } from "./resolver-venda";

export const criarPreVenda: AgentTool = {
  name: "criar_pre_venda",
  description:
    "Cria uma PRÉ-VENDA de balcão (status AGUARDANDO_PAGAMENTO) que vai para o Caixa receber o pagamento e emitir a nota. NÃO confirma, não baixa estoque nem emite nota — isso é feito por um humano no Caixa. Aceita o cliente por clienteBusca (nome ou CNPJ/CPF) e os itens por sku — resolve tudo sozinha, em UMA chamada. Cliente ausente = consumidor anônimo. precoUnitario é opcional (padrão: preço de venda do cadastro). Sempre confirme os itens com o usuário antes de chamar.",
  mode: "write",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      clienteId: { type: "string", description: "Id interno do cliente (se já souber)." },
      clienteBusca: { type: "string", description: "Nome ou CNPJ/CPF do cliente — a tool localiza (prefira este)." },
      itens: {
        type: "array",
        description: "Itens da venda (produtoId OU sku em cada item).",
        items: {
          type: "object",
          properties: {
            produtoId: { type: "string", description: "Id interno do produto (se já souber)." },
            sku: { type: "string", description: "SKU/código do produto — a tool localiza (prefira este)." },
            quantidade: { type: "number" },
            precoUnitario: { type: "number", description: "Opcional — padrão é o preço de venda do cadastro." }
          },
          required: ["quantidade"]
        }
      },
      observacoes: { type: "string", description: "Observações (opcional)." }
    },
    required: ["itens"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const itensRef = Array.isArray(args.itens) ? (args.itens as ItemRef[]) : [];
    if (itensRef.length === 0) {
      return { ok: false, data: null, error: "Informe ao menos um item." };
    }

    const cliente = await resolverCliente(scope, {
      clienteId: args.clienteId ? String(args.clienteId) : null,
      clienteBusca: args.clienteBusca ? String(args.clienteBusca) : null
    });
    if (cliente.erro) return { ok: false, data: null, error: cliente.erro };

    const itens = await resolverItens(scope, itensRef);
    if (itens.erro) return { ok: false, data: null, error: itens.erro };

    const pedido = await createSale(scope, {
      clienteId: cliente.id,
      canal: "BALCAO",
      statusInicial: "AGUARDANDO_PAGAMENTO",
      observacoes: args.observacoes ? String(args.observacoes) : undefined,
      itens: itens.itens
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
