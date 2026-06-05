import type { TenantScope } from "@/lib/auth/dev-session";
import { checkoutSale } from "./sale-use-cases";
import { emitServiceInvoiceAvulsa } from "@/domains/fiscal/application/standalone-emission-use-cases";
import { getCaixaAberto, registrarRecebimentoPdv } from "@/domains/cashier/application/cashier-use-cases";

export type PdvCheckoutInput = {
  clienteId?: string | null;
  modeloProduto?: "NFE" | "NFCE";
  produtos: Array<{ produtoId: string; quantidade: number; precoUnitario: number }>;
  servicos: Array<{ descricao: string; valor: number; codigoServicoLc116?: string | null; codigoNbs?: string | null }>;
  /** Formas de pagamento recebidas (o troco sai do dinheiro). Exigidas — o PDV opera com caixa. */
  pagamentos: Array<{ forma: string; valor: number }>;
};

export type PdvNotaResultado = {
  tipo: "PRODUTOS" | "SERVICOS";
  modelo: string;
  ok: boolean;
  id: string | null;
  numero: string | null;
  chaveAcesso: string | null;
  status: string | null;
  erro: string | null;
};

export type PdvCheckoutResult = {
  notas: PdvNotaResultado[];
  troco: number;
  total: number;
};

/**
 * Checkout do PDV: orquestra os dois fluxos fiscais já existentes em uma única finalização.
 *  - Produtos  → checkoutSale (NFC-e/NF-e), com baixa de estoque.
 *  - Serviços  → emitServiceInvoiceAvulsa (NFS-e).
 * Cada nota é independente: uma pode autorizar e a outra falhar, e cada falha é reportada
 * sem derrubar a outra. NF-e e NFS-e de serviço exigem cliente identificado.
 */
export async function pdvCheckout(scope: TenantScope, input: PdvCheckoutInput): Promise<PdvCheckoutResult> {
  const temProdutos = input.produtos.length > 0;
  const temServicos = input.servicos.length > 0;
  if (!temProdutos && !temServicos) {
    throw new Error("Adicione ao menos um produto ou serviço para finalizar.");
  }

  // O PDV opera com turno de caixa: exige caixa aberto antes de receber.
  const caixa = await getCaixaAberto(scope);
  if (!caixa) {
    throw new Error("Nenhum caixa aberto. Abra o caixa para operar o PDV.");
  }

  const modeloProduto = input.modeloProduto ?? "NFCE";
  if (modeloProduto === "NFE" && !input.clienteId) {
    throw new Error("NF-e exige um cliente identificado.");
  }
  if (temServicos && !input.clienteId) {
    throw new Error("A NFS-e dos serviços exige um cliente identificado.");
  }

  // Total que o cliente paga = soma dos produtos + serviços. Valida o pagamento antes de emitir.
  const totalProdutos = input.produtos.reduce((s, p) => s + p.precoUnitario * p.quantidade, 0);
  const totalServicos = input.servicos.reduce((s, v) => s + v.valor, 0);
  const total = Math.round((totalProdutos + totalServicos + Number.EPSILON) * 100) / 100;
  const somaPago = (input.pagamentos ?? []).reduce((s, p) => s + Number(p.valor), 0);
  if (somaPago + 0.0001 < total) {
    throw new Error(`Pagamento insuficiente: total ${total.toFixed(2)}, recebido ${somaPago.toFixed(2)}.`);
  }

  const notas: PdvNotaResultado[] = [];
  let pedidoVendaId: string | null = null;

  // 1. Produtos → NFC-e / NF-e
  if (temProdutos) {
    try {
      const formaResumo = input.pagamentos.map((p) => p.forma).join(", ");
      const r = await checkoutSale(
        scope,
        {
          clienteId: input.clienteId ?? null,
          canal: "PDV",
          formaPagamento: formaResumo || undefined,
          itens: input.produtos.map((p) => ({ produtoId: p.produtoId, quantidade: p.quantidade, precoUnitario: p.precoUnitario }))
        },
        { modelo: modeloProduto }
      );
      pedidoVendaId = r.pedidoId;
      notas.push({
        tipo: "PRODUTOS",
        modelo: modeloProduto,
        ok: Boolean(r.nota && !r.emitErro),
        id: r.nota?.id ?? null,
        numero: r.nota?.numero ?? null,
        chaveAcesso: r.nota?.chaveAcesso ?? null,
        status: r.nota?.status ?? null,
        erro: r.emitErro ?? r.nota?.motivo ?? null
      });
    } catch (error) {
      notas.push({
        tipo: "PRODUTOS",
        modelo: modeloProduto,
        ok: false,
        id: null,
        numero: null,
        chaveAcesso: null,
        status: null,
        erro: error instanceof Error ? error.message : "Falha ao emitir a nota de produtos."
      });
    }
  }

  // 2. Serviços → NFS-e
  if (temServicos) {
    try {
      const nfse = await emitServiceInvoiceAvulsa(scope, {
        receiver: { clienteId: input.clienteId ?? null },
        formaPagamento: input.pagamentos.map((p) => p.forma).join(", ") || undefined,
        servicos: input.servicos.map((s) => ({
          descricao: s.descricao,
          valor: s.valor,
          codigoServicoLc116: s.codigoServicoLc116 ?? null,
          codigoNbs: s.codigoNbs ?? null
        }))
      });
      notas.push({
        tipo: "SERVICOS",
        modelo: "NFSE",
        ok: nfse.status === "AUTORIZADA" || nfse.status === "PROCESSANDO",
        id: nfse.id,
        numero: nfse.numero ?? null,
        chaveAcesso: nfse.chaveAcesso ?? null,
        status: nfse.status,
        erro: nfse.status === "REJEITADA" || nfse.status === "ERRO" ? (nfse.motivo ?? "NFS-e rejeitada.") : null
      });
    } catch (error) {
      notas.push({
        tipo: "SERVICOS",
        modelo: "NFSE",
        ok: false,
        id: null,
        numero: null,
        chaveAcesso: null,
        status: null,
        erro: error instanceof Error ? error.message : "Falha ao emitir a NFS-e de serviços."
      });
    }
  }

  // 3. Registra o recebimento no caixa (pagamentos + movimento, com troco no dinheiro).
  const { troco } = await registrarRecebimentoPdv(scope, {
    pedidoVendaId,
    descricao: "Venda PDV",
    total,
    pagamentos: input.pagamentos
  });

  return { notas, troco, total };
}
