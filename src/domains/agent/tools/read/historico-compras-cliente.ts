import { prisma } from "@/lib/db/prisma";
import type { AgentTool } from "../../types";
import { searchCustomers } from "../../queries/customer-queries";

/**
 * Histórico de compras do cliente no SISTEMA ANTERIOR (migração, read-only): o que comprava,
 * quando e por qual preço — munição de negociação do vendedor no balcão/chat.
 */
export const historicoComprasCliente: AgentTool = {
  name: "historico_compras_cliente",
  description:
    "Consulta o histórico de compras do cliente no sistema ANTERIOR (migração): últimas compras, itens e preços praticados. Use para saber o que o cliente costuma comprar e por quanto.",
  mode: "read",
  roles: ["GESTOR", "VENDEDOR"],
  inputSchema: {
    type: "object",
    properties: {
      clienteId: { type: "string", description: "Id do cliente (de consultar_cliente)." },
      clienteBusca: { type: "string", description: "Alternativa: nome/documento para localizar o cliente." },
      limite: { type: "number", description: "Máximo de compras (1–20, padrão 5)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    let clienteId = (args.clienteId as string | undefined)?.trim();
    if (!clienteId && args.clienteBusca) {
      const achados = await searchCustomers(scope, { termo: args.clienteBusca as string, limite: 1 });
      clienteId = (achados as { clientes?: { id: string }[] }).clientes?.[0]?.id ?? (Array.isArray(achados) ? (achados[0] as { id?: string })?.id : undefined);
    }
    if (!clienteId) return { ok: false, data: { erro: "Informe clienteId ou clienteBusca (cliente não encontrado)." } };

    const limite = Math.min(Math.max(Number(args.limite) || 5, 1), 20);
    const vendas = await prisma.vendaMigrada.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, clienteId },
      orderBy: { data: "desc" },
      take: limite,
      include: { itens: { select: { descricao: true, quantidade: true, preco: true, total: true } } }
    });
    if (!vendas.length) return { ok: true, data: { compras: [], aviso: "Sem compras registradas no sistema anterior." } };

    return {
      ok: true,
      data: {
        compras: vendas.map((v) => ({
          pedido: v.numero,
          data: v.data ? v.data.toISOString().slice(0, 10) : null,
          total: Number(v.total),
          itens: v.itens.map((i) => `${i.descricao} — ${Number(i.quantidade)}x R$ ${Number(i.preco).toFixed(2)}`)
        }))
      }
    };
  }
};
