import type { AgentTool } from "../../types";
import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { confirmSale } from "@/domains/sales/application/sale-use-cases";

/**
 * CONFIRMA um pedido de venda pelo chat (GESTOR): baixa o estoque reservado e gera o financeiro
 * (parcelas do contas a receber conforme a condição; venda no boleto gera os boletos das parcelas
 * automaticamente). NÃO emite nota — para nota use faturar_pedido. É o que permite ao gestor fechar
 * a venda que ele mesmo criou pelo Telegram/WhatsApp sem depender de outra pessoa no sistema.
 */
export const confirmarPedido: AgentTool = {
  name: "confirmar_pedido",
  description:
    "CONFIRMA um pedido de venda (rascunho ou aguardando pagamento): baixa estoque e gera o financeiro (parcelas conforme a condição de pagamento; forma BOLETO gera os boletos automaticamente). NÃO emite nota fiscal — para emitir use faturar_pedido (que também confirma se preciso). Mostre o resumo e peça confirmação do usuário antes de chamar (confirmar=true).",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      numero: { type: "string", description: "Número do pedido (ex.: PV-000010)." },
      confirmar: { type: "boolean", description: "OBRIGATÓRIO true — só envie após o usuário confirmar o resumo." }
    },
    required: ["numero", "confirmar"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    if (args.confirmar !== true) {
      return { ok: false, data: null, error: "Confirmação pendente: mostre o resumo do pedido e peça o usuário confirmar; então chame de novo com confirmar=true." };
    }
    const numero = String(args.numero ?? "").trim();
    if (!numero) return { ok: false, data: null, error: "Informe o número do pedido." };

    const pedido = await prisma.pedidoVenda.findFirst({
      where: { numero, ...scopedByTenantCompany(scope) },
      select: { id: true, status: true, formaPagamento: true, condicaoPagamento: true, total: true }
    });
    if (!pedido) return { ok: false, data: null, error: `Pedido ${numero} não encontrado.` };
    if (pedido.status !== "RASCUNHO" && pedido.status !== "AGUARDANDO_PAGAMENTO") {
      return { ok: false, data: null, error: `Pedido ${numero} está em ${pedido.status} — só rascunho/aguardando pagamento podem ser confirmados.` };
    }

    try {
      const confirmado = await confirmSale(scope, pedido.id);
      return {
        ok: true,
        data: {
          numero,
          status: confirmado.status,
          total: Number(pedido.total),
          financeiro: pedido.condicaoPagamento
            ? `Parcelas geradas conforme condição "${pedido.condicaoPagamento}".`
            : "Conta a receber gerada (à vista/30 dias conforme padrão).",
          boletos: /boleto/i.test(pedido.formaPagamento ?? "")
            ? "Forma BOLETO: boletos das parcelas gerados automaticamente (confira no financeiro)."
            : null,
          proximoPasso: "Para emitir a nota fiscal, use faturar_pedido."
        }
      };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao confirmar o pedido." };
    }
  }
};
