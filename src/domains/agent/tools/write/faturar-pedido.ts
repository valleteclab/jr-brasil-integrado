import type { AgentTool } from "../../types";
import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { confirmSale, invoiceSale } from "@/domains/sales/application/sale-use-cases";

/**
 * FATURA um pedido de venda e EMITE a nota fiscal (NF-e mod 55 ou NFC-e mod 65). Ação IRREVERSÍVEL
 * (vai à SEFAZ) — por isso exige `confirmar: true`, que o agente só deve enviar após o usuário
 * responder EMITIR ao resumo (cliente + itens + valor). Confirma o pedido (baixa estoque + gera
 * contas a receber) se ainda estiver em rascunho, e então emite a nota.
 */
export const faturarPedido: AgentTool = {
  name: "faturar_pedido",
  description:
    "Fatura um pedido de venda e EMITE a nota fiscal (NFE mod 55 = exige cliente com endereço; NFCE mod 65 = consumidor). AÇÃO IRREVERSÍVEL (SEFAZ). Fluxo obrigatório: 1) use consultar_pedido para mostrar o resumo (cliente, itens, total); 2) peça o usuário responder EMITIR; 3) só então chame esta ferramenta com confirmar=true. Se o pedido estiver em rascunho, ele é confirmado (baixa estoque + gera contas a receber) antes de emitir.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      numero: { type: "string", description: "Número do pedido (ex.: PV-000003)." },
      modelo: { type: "string", enum: ["NFE", "NFCE"], description: "Modelo da nota: NFE (com cliente) ou NFCE (consumidor). Padrão NFE." },
      confirmar: { type: "boolean", description: "OBRIGATÓRIO true — só envie após o usuário confirmar com EMITIR. Sem isso, nada é emitido." }
    },
    required: ["numero", "confirmar"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    if (args.confirmar !== true) {
      return { ok: false, data: null, error: "Emissão não confirmada. Mostre o resumo e peça o usuário responder EMITIR; então chame de novo com confirmar=true." };
    }
    const numero = String(args.numero ?? "").trim();
    if (!numero) return { ok: false, data: null, error: "Informe o número do pedido." };
    const modelo = args.modelo === "NFCE" ? "NFCE" : "NFE";

    const pedido = await prisma.pedidoVenda.findFirst({
      where: { numero, ...scopedByTenantCompany(scope) },
      select: { id: true, status: true }
    });
    if (!pedido) return { ok: false, data: null, error: `Pedido ${numero} não encontrado.` };

    try {
      // Rascunho/aguardando pagamento → confirma (baixa estoque + contas a receber) antes de faturar.
      if (pedido.status === "RASCUNHO" || pedido.status === "AGUARDANDO_PAGAMENTO") {
        await confirmSale(scope, pedido.id);
      }
      const nota = await invoiceSale(scope, pedido.id, { modelo });
      return {
        ok: true,
        data: {
          pedido: numero,
          modelo,
          notaId: nota.id,
          numeroNota: nota.numero,
          status: nota.status,
          chaveAcesso: nota.chaveAcesso,
          pdfUrl: `/api/erp/fiscal/${nota.id}/pdf`
        }
      };
    } catch (e) {
      return { ok: false, data: null, error: e instanceof Error ? e.message : "Falha ao faturar/emitir a nota." };
    }
  }
};
