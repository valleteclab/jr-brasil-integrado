import type { AgentTool } from "../../types";
import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { gerarBoletoParaRecebivel, listContasComCobranca } from "@/domains/finance/application/boleto-use-cases";

/**
 * Emite BOLETO(s). Aceita o TÍTULO direto (contaReceberId) OU o PEDIDO (pedidoNumero) — nesse
 * caso resolve os títulos em aberto do pedido sozinha e emite um boleto por parcela, em UMA
 * chamada (o modelo não precisa descobrir ids do financeiro).
 */
export const emitirBoleto: AgentTool = {
  name: "emitir_boleto",
  description:
    "Emite BOLETO bancário. Informe pedidoNumero (ex.: PV-000011) para emitir os boletos de TODAS as parcelas em aberto do pedido — resolve os títulos sozinha; ou contaReceberId para um título específico (de consultar_contas_receber). Registra no banco e devolve a linha digitável de cada boleto. Confirme com o gestor o cliente e o valor ANTES de emitir. Se contaBancariaId não for informada, usa a primeira conta com cobrança configurada.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      pedidoNumero: { type: "string", description: "Número do pedido de venda (ex.: PV-000011) — emite boleto de cada parcela em aberto (prefira este)." },
      contaReceberId: { type: "string", description: "Id de um título específico (alternativa ao pedidoNumero)." },
      contaBancariaId: { type: "string", description: "Id da conta bancária de cobrança (opcional; padrão = primeira configurada)." }
    },
    additionalProperties: false
  },
  handler: async (scope, args) => {
    const pedidoNumero = args.pedidoNumero ? String(args.pedidoNumero).trim() : "";
    const contaReceberIdArg = args.contaReceberId ? String(args.contaReceberId).trim() : "";
    if (!pedidoNumero && !contaReceberIdArg) {
      return { ok: false, data: null, error: "Informe pedidoNumero (ex.: PV-000011) ou contaReceberId." };
    }

    // Resolve os títulos a cobrar.
    let titulos: Array<{ id: string; descricao: string; vencimento: Date }> = [];
    if (contaReceberIdArg) {
      const titulo = await prisma.contaReceber.findFirst({
        where: { id: contaReceberIdArg, ...scopedByTenantCompany(scope) },
        select: { id: true, descricao: true, vencimento: true }
      });
      if (!titulo) {
        return { ok: false, data: null, error: `Título "${contaReceberIdArg}" não encontrado. Prefira informar pedidoNumero (ex.: PV-000011) que eu localizo as parcelas.` };
      }
      titulos = [titulo];
    } else {
      const pedido = await prisma.pedidoVenda.findFirst({
        where: { numero: pedidoNumero, ...scopedByTenantCompany(scope) },
        select: { id: true, numero: true, status: true }
      });
      if (!pedido) return { ok: false, data: null, error: `Pedido ${pedidoNumero} não encontrado.` };
      titulos = await prisma.contaReceber.findMany({
        where: { pedidoVendaId: pedido.id, ...scopedByTenantCompany(scope), status: { in: ["ABERTO", "PARCIAL", "VENCIDO"] } },
        orderBy: { vencimento: "asc" },
        select: { id: true, descricao: true, vencimento: true }
      });
      if (!titulos.length) {
        const dica = pedido.status === "RASCUNHO" || pedido.status === "AGUARDANDO_PAGAMENTO"
          ? " O pedido ainda não foi confirmado — confirme (confirmar_pedido) para gerar as parcelas e tente de novo."
          : " Verifique se as parcelas já foram quitadas.";
        return { ok: false, data: null, error: `Nenhuma parcela em aberto para o pedido ${pedidoNumero}.${dica}` };
      }
    }

    let contaBancariaId = args.contaBancariaId ? String(args.contaBancariaId) : "";
    if (!contaBancariaId) {
      const contas = await listContasComCobranca(scope);
      if (!contas.length) {
        return { ok: false, data: null, error: "Nenhuma conta bancária com cobrança configurada (Configurações → Contas financeiras)." };
      }
      contaBancariaId = contas[0].id;
    }

    const boletos: Array<Record<string, unknown>> = [];
    const falhas: Array<{ titulo: string; erro: string }> = [];
    for (const titulo of titulos) {
      try {
        const boleto = await gerarBoletoParaRecebivel(scope, titulo.id, { contaBancariaId });
        boletos.push({
          titulo: titulo.descricao,
          status: boleto.status,
          nossoNumero: boleto.nossoNumero,
          linhaDigitavel: boleto.linhaDigitavel,
          valor: Number(boleto.valor),
          vencimento: boleto.vencimento.toISOString().slice(0, 10),
          // Link do PDF para reenviar ao cliente (rota autenticada do ERP).
          pdfUrl: `/api/erp/financeiro/contas-receber/${titulo.id}/boleto/pdf`
        });
      } catch (e) {
        falhas.push({ titulo: titulo.descricao, erro: e instanceof Error ? e.message : "falha" });
      }
    }

    if (!boletos.length) {
      return { ok: false, data: { falhas }, error: `Nenhum boleto emitido: ${falhas.map((f) => `${f.titulo}: ${f.erro}`).join(" | ")}` };
    }
    return { ok: true, data: { emitidos: boletos.length, boletos, falhas: falhas.length ? falhas : undefined } };
  }
};
