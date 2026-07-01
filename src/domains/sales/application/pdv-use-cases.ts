import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { gerarParcelas, rotuloParcela } from "@/lib/finance/condicao-pagamento";
import { validarSenhaAdmin } from "@/lib/auth/admin-credential";
import { checkoutSale } from "./sale-use-cases";
import { criarRetiradaExpedicao } from "./expedicao-use-cases";
import { emitServiceInvoiceAvulsa } from "@/domains/fiscal/application/standalone-emission-use-cases";
import { getCaixaAberto, registrarRecebimentoPdv, type PagamentoDetalhado } from "@/domains/cashier/application/cashier-use-cases";
import { assertModuloLiberado } from "@/lib/auth/tenant-features";
import { classificacaoReceitaPadraoId } from "@/domains/finance/application/classificacao-use-cases";

const FORMA_CREDIARIO = "CREDIARIO";
const FORMA_DINHEIRO = "DINHEIRO";
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export type PdvCheckoutInput = {
  clienteId?: string | null;
  /** Vendedor cadastrado (gera comissão conforme o percentual dele). */
  vendedorId?: string | null;
  modeloProduto?: "NFE" | "NFCE";
  /** Quando false, fecha a venda só com RECIBO (cupom não fiscal) — exige Empresa.permiteVendaNaoFiscal. */
  emitirFiscal?: boolean;
  /** desconto: valor em R$ da LINHA (quantidade × preço − desconto). Exige autorização de admin. */
  produtos: Array<{ produtoId: string; quantidade: number; precoUnitario: number; desconto?: number }>;
  servicos: Array<{ descricao: string; valor: number; codigoServicoLc116?: string | null; codigoNbs?: string | null }>;
  /** Formas de pagamento recebidas (o troco sai do dinheiro). Exigidas — o PDV opera com caixa. */
  pagamentos: PagamentoDetalhado[];
  /** Condição do crediário ("30", "30/60/90"...) quando há forma CREDIARIO. Padrão: 30 dias. */
  condicaoCrediario?: string | null;
  /** Desconto global em R$ (rateado nos itens pelo document-builder antes de emitir). */
  descontoGlobal?: number;
  /** Senha de um administrador (qualquer admin do tenant). Exigida quando o desconto efetivo > limite. */
  senhaAdmin?: string;
  /** Gera recibo de retirada na expedição (exige módulo habilitado e venda com produtos). */
  retiradaExpedicao?: boolean;
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
  /** ID do pedido criado (para imprimir recibo HTML ou re-emitir nota depois). null se só serviços. */
  pedidoVendaId: string | null;
  /** Parcelas geradas no contas a receber quando parte da venda foi em crediário. */
  crediario: { valor: number; parcelas: number; primeiroVencimento: string } | null;
  /** Recibo de retirada na expedição (quando solicitado). */
  retirada: { id: string; codigo: string } | null;
  /**
   * Aviso quando a venda foi emitida mas o recebimento NÃO entrou no caixa (registro falhou
   * após a emissão). Sinaliza que há dinheiro sem rastro e exige lançamento manual. null = ok.
   */
  avisoRecebimento: string | null;
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
  await assertModuloLiberado(scope, "pdvTelaCheiaHabilitado");
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
  // Venda não fiscal só com a flag da empresa ligada — defesa em profundidade do gate da UI.
  if (input.emitirFiscal === false) {
    const empresa = await prisma.empresa.findUnique({
      where: { id: scope.empresaId },
      select: { permiteVendaNaoFiscal: true }
    });
    if (!empresa?.permiteVendaNaoFiscal) {
      throw new Error("Venda não fiscal não habilitada para esta empresa.");
    }
    if (temServicos) {
      throw new Error("Serviços exigem NFS-e — não é possível finalizar sem nota.");
    }
  }
  if (input.emitirFiscal !== false && modeloProduto === "NFE" && !input.clienteId) {
    throw new Error("NF-e exige um cliente identificado.");
  }
  if (temServicos && !input.clienteId) {
    throw new Error("A NFS-e dos serviços exige um cliente identificado.");
  }

  // Desconto: % efetivo (item + global) versus limite da empresa.
  // Acima do limite, exige senha de um admin (validada AQUI no servidor — UI pré-valida pra UX).
  for (const p of input.produtos) {
    const desconto = Math.max(0, Number(p.desconto) || 0);
    if (desconto > p.precoUnitario * p.quantidade) {
      throw new Error("Desconto de um item não pode ser maior que o valor do item.");
    }
  }
  const descontoItens = round2(input.produtos.reduce((s, p) => s + Math.max(0, Number(p.desconto) || 0), 0));
  const descontoGlobal = round2(Math.max(0, Number(input.descontoGlobal) || 0));
  const subtotalBruto = round2(input.produtos.reduce((s, p) => s + p.precoUnitario * p.quantidade, 0)
    + input.servicos.reduce((s, v) => s + v.valor, 0));
  const descontoTotal = round2(descontoItens + descontoGlobal);
  const descontoPctEfetivo = subtotalBruto > 0 ? (descontoTotal / subtotalBruto) * 100 : 0;
  const empresaCfg = await prisma.empresa.findUnique({
    where: { id: scope.empresaId },
    select: { descontoSemAutorizacaoPct: true }
  });
  const limiteSemAuth = Number(empresaCfg?.descontoSemAutorizacaoPct ?? 0);
  let autorizadoPor: { usuarioId: string; nome: string } | null = null;
  if (descontoPctEfetivo > limiteSemAuth + 0.01) {
    if (!input.senhaAdmin?.trim()) {
      throw new Error(`Desconto de ${descontoPctEfetivo.toFixed(2)}% acima do limite (${limiteSemAuth.toFixed(2)}%). Exige senha de administrador.`);
    }
    autorizadoPor = await validarSenhaAdmin(scope, input.senhaAdmin);
  }

  // Total que o cliente paga = soma dos produtos (líquidos de desconto de linha) + serviços − desconto global.
  const totalProdutos = input.produtos.reduce(
    (s, p) => s + p.precoUnitario * p.quantidade - Math.max(0, Number(p.desconto) || 0),
    0
  );
  const totalServicos = input.servicos.reduce((s, v) => s + v.valor, 0);
  const total = round2(Math.max(0, totalProdutos + totalServicos - descontoGlobal));
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
          vendedorId: input.vendedorId ?? null,
          canal: "PDV",
          formaPagamento: formaResumo || undefined,
          condicaoPagamento: valorCrediario > 0 ? (input.condicaoCrediario ?? "30") : undefined,
          desconto: descontoGlobal,
          itens: input.produtos.map((p) => ({
            produtoId: p.produtoId,
            quantidade: p.quantidade,
            precoUnitario: p.precoUnitario,
            desconto: Math.max(0, Number(p.desconto) || 0)
          }))
        },
        // O PDV recebe à vista no caixa e trata o crediário aqui — a confirmação da venda
        // não deve gerar contas a receber.
        { modelo: modeloProduto, contasReceber: "NENHUMA", emitirFiscal: input.emitirFiscal }
      );
      // Auditoria do desconto autorizado (vinculada ao pedido criado).
      const admin = autorizadoPor;
      if (admin && descontoTotal > 0) {
        await prisma.$transaction(async (tx) => {
          await createAuditLog(tx, {
            scope,
            entidade: "PedidoVenda",
            entidadeId: r.pedidoId,
            acao: "PDV_DESCONTO_AUTORIZADO",
            usuarioId: admin.usuarioId,
            payload: {
              autorizadoPor: admin.nome,
              descontoTotal,
              descontoItens,
              descontoGlobal,
              descontoPctEfetivo: Number(descontoPctEfetivo.toFixed(2)),
              limiteSemAuth,
              itens: input.produtos
                .filter((p) => (Number(p.desconto) || 0) > 0)
                .map((p) => ({ produtoId: p.produtoId, desconto: Number(p.desconto) }))
            }
          });
        });
      }
      pedidoVendaId = r.pedidoId;
      pedidoNumero = r.pedidoNumero;
      // Venda não fiscal: não há nota; consideramos OK (venda fechada). Modelo "RECIBO" sinaliza.
      const naoFiscal = input.emitirFiscal === false;
      notas.push({
        tipo: "PRODUTOS",
        modelo: naoFiscal ? "RECIBO" : modeloProduto,
        ok: naoFiscal ? true : Boolean(r.nota && !r.emitErro),
        id: r.nota?.id ?? null,
        numero: r.nota?.numero ?? null,
        chaveAcesso: r.nota?.chaveAcesso ?? null,
        status: naoFiscal ? "RECIBO" : (r.nota?.status ?? null),
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
  // A emissão (passo 1) já baixou estoque e emitiu a nota — fora desta transação. Se o registro
  // do recebimento falhar, NÃO podemos perder o resultado da venda (dinheiro sem rastro). Por isso:
  //  (a) revalidamos o caixa aberto IMEDIATAMENTE antes de registrar;
  //  (b) capturamos qualquer falha e devolvemos o checkout com um aviso explícito para lançamento
  //      manual, em vez de deixar a exceção crua subir e descartar a(s) nota(s) já emitida(s).
  let troco = 0;
  let avisoRecebimento: string | null = null;
  try {
    const caixaAtual = await getCaixaAberto(scope);
    if (!caixaAtual) {
      throw new Error("O caixa foi fechado durante a finalização. Reabra o caixa para registrar.");
    }
    const r = await registrarRecebimentoPdv(scope, {
      pedidoVendaId,
      descricao: pedidoNumero ? `Venda ${pedidoNumero}` : "Venda PDV",
      total,
      numero: pedidoNumero ?? undefined,
      clienteId: input.clienteId ?? null,
      pagamentos
    });
    troco = r.troco;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "erro desconhecido";
    const refNota = pedidoNumero ? `nota ${pedidoNumero}` : "venda emitida";
    avisoRecebimento =
      `Venda emitida (${refNota}), mas o recebimento NÃO foi registrado no caixa: ${motivo}. ` +
      `Registre o recebimento manualmente no caixa.`;
    // Loga com destaque para o operador/suporte: há dinheiro recebido sem movimento de caixa.
    console.error(`[pdvCheckout] ${avisoRecebimento}`, error);
  }

  // 4. Crediário → parcelas no contas a receber, conforme a condição informada.
  let crediario: PdvCheckoutResult["crediario"] = null;
  if (valorCrediario > 0 && input.clienteId) {
    const parcelas = gerarParcelas(valorCrediario, input.condicaoCrediario ?? "30");
    const descricaoBase = pedidoNumero ? `Venda PDV ${pedidoNumero}` : "Venda PDV (serviços)";
    await prisma.$transaction(async (tx) => {
      const classificacaoReceita = await classificacaoReceitaPadraoId(tx, scope, "vendas");
      for (const parcela of parcelas) {
        await tx.contaReceber.create({
          data: {
            ...scopedByTenantCompanyAmbiente(scope),
            clienteId: input.clienteId as string,
            pedidoVendaId: pedidoVendaId ?? null,
            classificacaoId: classificacaoReceita,
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

  // 5. Recibo de retirada na expedição (só faz sentido quando a venda tem produtos).
  let retirada: PdvCheckoutResult["retirada"] = null;
  if (input.retiradaExpedicao && pedidoVendaId) {
    const r = await criarRetiradaExpedicao(scope, pedidoVendaId);
    retirada = { id: r.id, codigo: r.codigo };
  }

  return { notas, troco, total, pedidoVendaId, crediario, retirada, avisoRecebimento };
}
