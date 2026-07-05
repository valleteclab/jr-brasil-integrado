import type { AgentTool } from "../../types";
import { createQuote } from "@/domains/sales-quote/application/quote-use-cases";
import { resolverCliente, resolverItens, type ItemRef } from "./resolver-venda";

export const criarOrcamento: AgentTool = {
  name: "criar_orcamento",
  description:
    "Cria um ORÇAMENTO em rascunho (status EM_ANALISE) para um cliente. Aceita o cliente por clienteBusca (nome ou CNPJ/CPF) e os itens por sku — resolve tudo sozinha, em UMA chamada. precoUnitario é opcional (padrão: preço de venda do cadastro). NÃO aprova nem converte em pedido — um humano faz isso na tela de Orçamentos. Sempre confirme cliente e itens antes de chamar.",
  mode: "write",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      clienteId: { type: "string", description: "Id interno do cliente (se já souber)." },
      clienteBusca: { type: "string", description: "Nome ou CNPJ/CPF do cliente — a tool localiza (prefira este)." },
      itens: {
        type: "array",
        description: "Itens do orçamento (produtoId OU sku em cada item).",
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
      validadeDias: { type: "number", description: "Validade em dias (opcional)." },
      condicaoPagamento: { type: "string", description: "Condição de pagamento (opcional)." },
      observacaoVendedor: { type: "string", description: "Observação do vendedor (opcional)." }
    },
    required: ["itens"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const itensRef = Array.isArray(args.itens) ? (args.itens as ItemRef[]) : [];
    if (itensRef.length === 0) {
      return { ok: false, data: null, error: "Informe ao menos um item." };
    }

    // Orçamento exige cliente (diferente da pré-venda, que aceita anônimo).
    const cliente = await resolverCliente(scope, {
      clienteId: args.clienteId ? String(args.clienteId) : null,
      clienteBusca: args.clienteBusca ? String(args.clienteBusca) : null
    });
    if (cliente.erro) return { ok: false, data: null, error: cliente.erro };
    if (!cliente.id) return { ok: false, data: null, error: "Orçamento exige cliente — informe clienteBusca (nome ou CNPJ/CPF)." };

    const itens = await resolverItens(scope, itensRef);
    if (itens.erro) return { ok: false, data: null, error: itens.erro };
    const itensResolvidos = itens.itens ?? [];

    const orcamento = await createQuote(scope, {
      clienteId: cliente.id ?? null,
      itens: itensResolvidos,
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
