import type { AgentTool } from "../../types";
import { emitProductInvoiceAvulsa } from "@/domains/fiscal/application/standalone-emission-use-cases";
import { resolverCliente, resolverItens, type ItemRef } from "./resolver-venda";

export const emitirNotaProduto: AgentTool = {
  name: "emitir_nota_produto",
  description:
    "Emite NF-e ou NFC-e AVULSA de produtos, sem pedido de venda. AÇÃO IRREVERSÍVEL na SEFAZ: mostre destinatário, modelo, itens, total e se haverá baixa de estoque; peça o usuário responder EMITIR; só então chame com confirmar=true. Aceita clienteBusca/clienteId e itens por SKU. NF-e exige cliente cadastrado com endereço; NFC-e aceita consumidor não identificado.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      modelo: { type: "string", enum: ["NFE", "NFCE"], description: "NFE modelo 55 ou NFCE modelo 65." },
      clienteId: { type: "string", description: "Id do cliente cadastrado, se já conhecido." },
      clienteBusca: { type: "string", description: "Nome, CPF ou CNPJ para localizar o cliente." },
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            produtoId: { type: "string" },
            sku: { type: "string", description: "SKU/código do produto; prefira este." },
            quantidade: { type: "number" },
            precoUnitario: { type: "number", description: "Opcional; usa preço do cadastro quando ausente." }
          },
          required: ["quantidade"]
        }
      },
      naturezaOperacao: { type: "string", description: "Padrão: Venda de mercadoria." },
      formaPagamento: { type: "string" },
      condicaoPagamento: { type: "string" },
      observacoes: { type: "string" },
      baixarEstoque: {
        type: "boolean",
        description: "Se true, baixa o estoque dos produtos após autorização. Só use se o usuário confirmar isso no resumo."
      },
      confirmar: { type: "boolean", description: "Obrigatório true após o usuário responder EMITIR." }
    },
    required: ["modelo", "itens", "confirmar"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    if (args.confirmar !== true) {
      return { ok: false, data: null, error: "Emissão não confirmada. Mostre destinatário, modelo, itens, total e baixa de estoque; peça o usuário responder EMITIR." };
    }
    const modelo = args.modelo === "NFCE" ? "NFCE" : "NFE";
    const itensRef = Array.isArray(args.itens) ? (args.itens as ItemRef[]) : [];
    if (!itensRef.length) return { ok: false, data: null, error: "Informe ao menos um produto." };

    const cliente = await resolverCliente(scope, {
      clienteId: args.clienteId ? String(args.clienteId) : null,
      clienteBusca: args.clienteBusca ? String(args.clienteBusca) : null
    });
    if (cliente.erro) return { ok: false, data: null, error: cliente.erro };
    if (modelo === "NFE" && !cliente.id) {
      return { ok: false, data: null, error: "NF-e exige cliente cadastrado com endereço. Informe clienteBusca ou clienteId." };
    }
    const itens = await resolverItens(scope, itensRef);
    if (itens.erro) return { ok: false, data: null, error: itens.erro };

    try {
      const nota = await emitProductInvoiceAvulsa(scope, {
        modelo,
        naturezaOperacao: args.naturezaOperacao ? String(args.naturezaOperacao) : "Venda de mercadoria",
        receiver: cliente.id ? { clienteId: cliente.id } : {},
        formaPagamento: args.formaPagamento ? String(args.formaPagamento) : null,
        condicaoPagamento: args.condicaoPagamento ? String(args.condicaoPagamento) : null,
        observacoes: args.observacoes ? String(args.observacoes) : null,
        baixarEstoque: args.baixarEstoque === true,
        itens: (itens.itens ?? []).map((item) => ({
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitario
        }))
      });
      return {
        ok: true,
        data: {
          notaId: nota.id,
          modelo,
          numeroNota: nota.numero,
          status: nota.status,
          chaveAcesso: nota.chaveAcesso,
          motivo: nota.motivo,
          estoqueBaixado: args.baixarEstoque === true && nota.status === "AUTORIZADA",
          pdfUrl: `/api/erp/fiscal/${nota.id}/pdf`,
          xmlUrl: `/api/erp/fiscal/${nota.id}/xml`
        }
      };
    } catch (error) {
      return { ok: false, data: null, error: error instanceof Error ? error.message : "Falha ao emitir a nota de produto." };
    }
  }
};
