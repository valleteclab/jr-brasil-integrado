import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { gerarParcelas, rotuloParcela } from "@/lib/finance/condicao-pagamento";
import { checkoutSale } from "./sale-use-cases";
import { emitServiceInvoiceAvulsa } from "@/domains/fiscal/application/standalone-emission-use-cases";
import { getCaixaAberto, registrarRecebimentoPdv } from "@/domains/cashier/application/cashier-use-cases";

const FORMA_CREDIARIO = "CREDIARIO";
const FORMA_DINHEIRO = "DINHEIRO";
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export type PdvCheckoutInput = {
  clienteId?: string | null;
  modeloProduto?: "NFE" | "NFCE";
  produtos: Array<{ produtoId: string; quantidade: number; precoUnitario: number }>;
  servicos: Array<{ descricao: string; valor: number; codigoServicoLc116?: string | null; codigoNbs?: string | null }>;
  /** Formas de pagamento recebidas (o troco sai do dinheiro). Exigidas — o PDV opera com caixa. */
  pagamentos: Array<{ forma: string; valor: number }>;
  /** Condição do crediário ("30", "30/60/90"...) quando há forma CREDIARIO. Padrão: 30 dias. */
  condicaoCrediario?: string | null;
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
  /** Parcelas geradas no contas a receber quando parte da venda foi em crediário. */
  crediario: { valor: number; parcelas: number; primeiroVencimento: string } | null;
};

/**
 * Checkout do PDV: orquestra os dois fluxos fiscais já existentes em uma única finalização.
 *  - Produtos  → checkoutSale (NFC-e/NF-e), com baixa de estoque.
 *  - Serviços  → emitServiceInvoiceAvulsa (NFS-e).
 * Cada nota é independente: uma pode autorizar e a outra falhar, e cada falha é reportada
 * sem derrubar a outra. NF-e e NFS-e de serviço exigem cliente identificado.
 *
 * Pagamento: as formas à vista entram no caixa (movimentos VENDA); a forma CREDIARIO
 * (venda a prazo, exige cliente identificado) vira parcelas no contas a receber conforme
 * a condição informada. O PDV não gera contas a receber pelas formas à vista.
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
  const total = round2(totalProdutos + totalServicos);
  const pagamentos = (input.pagamentos ?? []).filter((p) => Number(p.valor) > 0);
  const somaPago = round2(pagamentos.reduce((s, p) => s + Number(p.valor), 0));
  if (somaPago + 0.0001 < total) {
    throw new Error(`Pagamento insuficiente: total ${total.toFixed(2)}, recebido ${somaPago.toFixed(2)}.`);
  }

  // Crediário (venda a prazo): exige cliente e não pode gerar/absorver troco.
  const valorCrediario = round2(
    pagamentos.filter((p) => p.forma === FORMA_CREDIARIO).reduce((s, p) => s + Number(p.valor), 0)
  );
  if (valorCrediario > 0) {
    if (!input.clienteId) {
      throw new Error("Crediário (venda a prazo) exige um cliente identificado.");
    }
    if (valorCrediario > total + 0.0001) {
      throw new Error(`Crediário (${valorCrediario.toFixed(2)}) não pode ser maior que o total da venda (${total.toFixed(2)}).`);
    }
    const troco = round2(somaPago - total);
    const somaDinheiro = round2(
      pagamentos.filter((p) => p.forma === FORMA_DINHEIRO).reduce((s, p) => s + Number(p.valor), 0)
    );
    if (troco > somaDinheiro + 0.0001) {
      throw new Error("O troco só pode sair do dinheiro — ajuste o valor do crediário para fechar a conta.");
    }
  }

  const notas: PdvNotaResultado[] = [];
  let pedidoVendaId: string | null = null;
  let pedidoNumero: string | null = null;

  // 1. Produtos → NFC-e / NF-e
  if (temProdutos) {
    try {
      const formaResumo = pagamentos.map((p) => p.forma).join(", ");
      const r = await checkoutSale(
        scope,
        {
          clienteId: input.clienteId ?? null,
          canal: "PDV",
          formaPagamento: formaResumo || undefined,
          condicaoPagamento: valorCrediario > 0 ? (input.condicaoCrediario ?? "30") : undefined,
          itens: input.produtos.map((p) => ({ produtoId: p.produtoId, quantidade: p.quantidade, precoUnitario: p.precoUnitario }))
        },
        // O PDV recebe à vista no caixa e trata o crediário aqui — a confirmação da venda
        // não deve gerar contas a receber.
        { modelo: modeloProduto, contasReceber: "NENHUMA" }
      );
      pedidoVendaId = r.pedidoId;
      pedidoNumero = r.pedidoNumero;
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
        formaPagamento: pagamentos.map((p) => p.forma).join(", ") || undefined,
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
    pagamentos
  });

  // 4. Crediário → parcelas no contas a receber, conforme a condição informada.
  let crediario: PdvCheckoutResult["crediario"] = null;
  if (valorCrediario > 0 && input.clienteId) {
    const parcelas = gerarParcelas(valorCrediario, input.condicaoCrediario ?? "30");
    const descricaoBase = pedidoNumero ? `Venda PDV ${pedidoNumero}` : "Venda PDV (serviços)";
    await prisma.$transaction(async (tx) => {
      for (const parcela of parcelas) {
        await tx.contaReceber.create({
          data: {
            ...scopedByTenantCompany(scope),
            clienteId: input.clienteId as string,
            pedidoVendaId: pedidoVendaId ?? null,
            descricao: `${descricaoBase} crediário${rotuloParcela(parcela)}`,
            numeroDocumento: pedidoNumero,
            origem: "VENDA",
            formaPagamento: FORMA_CREDIARIO,
            vencimento: parcela.vencimento,
            valor: parcela.valor,
            valorPago: 0,
            juros: 0,
            multa: 0,
            descontoBaixa: 0,
            status: "ABERTO"
          }
        });
      }
      await createAuditLog(tx, {
        scope,
        entidade: "PedidoVenda",
        entidadeId: pedidoVendaId ?? "PDV",
        acao: "CREDIARIO",
        payload: { clienteId: input.clienteId, valor: valorCrediario, parcelas: parcelas.length, condicao: input.condicaoCrediario ?? "30" }
      });
    });
    crediario = {
      valor: valorCrediario,
      parcelas: parcelas.length,
      primeiroVencimento: parcelas[0].vencimento.toISOString()
    };
  }

  return { notas, troco, total, crediario };
}
