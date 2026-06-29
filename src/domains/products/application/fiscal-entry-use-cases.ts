import { createHash } from "node:crypto";
import type { FinalidadeEntrada, Prisma, RegimeTributario, TipoTributo } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany, scopedByTenantCompanyAmbiente } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { parseNfeXml } from "@/domains/products/xml/nfe-server-parser";
import type { ParsedNfeItem } from "@/domains/products/xml/nfe-server-parser";
import { callOpenRouter } from "@/domains/ai/openrouter-service";
import { cfopIndicaSt, isSubstituicaoTributaria } from "@/domains/fiscal/cfop";
import { cfopVendaPadrao, creditoPorFinalidade, isFinalidadeEntrada, resolveCfopEntrada } from "@/domains/fiscal/finalidade-entrada";
import { loadFinalidadeRules, resolveFinalidadeForItem } from "@/domains/fiscal/application/finalidade-regra-use-cases";
import { sugerirCategoriasEntrada } from "./ai-enrichment-use-cases";

const FISCAL_TRANSACTION_OPTIONS = {
  maxWait: 10000,
  timeout: 30000
};

// Importação e processamento de NF-e percorrem TODOS os itens da nota dentro de uma transação
// (classificação, produtos, estoque, impostos). Notas com muitos itens passam dos 30s padrão —
// timeout maior evita "Transaction already closed". As demais operações fiscais seguem em 30s.
const FISCAL_BATCH_TRANSACTION_OPTIONS = {
  maxWait: 15000,
  timeout: 120000
};

function nfeChecksum(xmlText: string) {
  return createHash("sha256").update(xmlText).digest("hex");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(value);
}

type FiscalEntryDraftSource = {
  id: string;
  numero: string | null;
  serie: string | null;
  modelo: string | null;
  chaveAcesso: string | null;
  cfopPrincipal: string | null;
  emitidaEm: Date | null;
  recebidaEm: Date | null;
  status: string;
  totalProdutos: Prisma.Decimal;
  totalNota: Prisma.Decimal;
  valorFrete: Prisma.Decimal;
  valorSeguro: Prisma.Decimal;
  valorDesconto: Prisma.Decimal;
  outrasDespesas: Prisma.Decimal;
  informacoesComplementares?: string | null;
  fornecedor: {
    documento: string;
    razaoSocial: string;
  } | null;
  xmlImportacao: {
    xmlOriginal: string | null;
  } | null;
  parcelas?: Array<{
    numero: string;
    vencimento: Date;
    valor: Prisma.Decimal;
    formaPagamento: string | null;
    origem: string;
  }>;
  itens: Array<{
    id: string;
    produtoId: string | null;
    codigoFornecedor: string;
    descricaoFornecedor: string;
    gtin: string | null;
    ncm: string | null;
    cest: string | null;
    cfop: string | null;
    unidade: string;
    quantidade: Prisma.Decimal;
    valorUnitario: Prisma.Decimal;
    valorTotal: Prisma.Decimal;
    fatorConversao: Prisma.Decimal;
    unidadeVenda: string | null;
    precoVendaDefinido: Prisma.Decimal | null;
    precoMinimoDefinido: Prisma.Decimal | null;
    marcaDefinida: string | null;
    confiancaVinculo: Prisma.Decimal | null;
    revisarVinculo: boolean;
    finalidade: FinalidadeEntrada | null;
    finalidadeOrigem: string | null;
    cfopEntradaDerivado: string | null;
    movimentaEstoque: boolean;
    impostos?: Array<{
      tributo: TipoTributo;
      cst: string | null;
      csosn: string | null;
      baseCalculo: Prisma.Decimal | null;
      aliquota: Prisma.Decimal | null;
      valor: Prisma.Decimal | null;
      aliquotaCredSn?: Prisma.Decimal | null;
      valorCredSn?: Prisma.Decimal | null;
    }>;
  }>;
};

type FiscalEntryInstallmentInput = {
  number?: string;
  dueDate?: string | null;
  value?: number;
  paymentMethod?: string | null;
};

function buildFiscalEntryDraft(entrada: FiscalEntryDraftSource) {
  let installments: Array<{ number: string; dueDate: string | null; value: number }> =
    entrada.parcelas?.map((parcela) => ({
      number: parcela.numero,
      dueDate: parcela.vencimento.toISOString(),
      value: Number(parcela.valor)
    })) ?? [];

  if (!installments.length && entrada.xmlImportacao?.xmlOriginal) {
    try {
      const parsed = parseNfeXml(entrada.xmlImportacao.xmlOriginal);
      installments = parsed.installments.map((installment, index) => ({
        number: installment.number || String(index + 1),
        dueDate: installment.dueDate?.toISOString() ?? null,
        value: installment.value
      }));
    } catch {
      installments = [];
    }
  }

  return {
    id: entrada.id,
    invoice: entrada.numero ?? undefined,
    supplier: entrada.fornecedor?.razaoSocial,
    accessKey: entrada.chaveAcesso ?? undefined,
    series: entrada.serie ?? undefined,
    model: entrada.modelo ?? undefined,
    issuedAt: entrada.emitidaEm?.toISOString() ?? null,
    supplierDocument: entrada.fornecedor?.documento,
    mainCfop: entrada.cfopPrincipal ?? undefined,
    totals: {
      products: Number(entrada.totalProdutos),
      invoice: Number(entrada.totalNota),
      freight: Number(entrada.valorFrete),
      insurance: Number(entrada.valorSeguro),
      discount: Number(entrada.valorDesconto),
      otherExpenses: Number(entrada.outrasDespesas)
    },
    installments,
    status: entrada.status,
    receivedAt: entrada.recebidaEm?.toISOString() ?? new Date().toISOString(),
    // Informações complementares do XML — aqui costuma vir o crédito de ICMS do Simples (LC 123).
    infCpl: entrada.informacoesComplementares ?? undefined,
    items: entrada.itens.map((item) => ({
      id: item.id,
      importedProduct: {
        id: item.produtoId ?? `entrada-${item.id}`,
        sku: item.codigoFornecedor.toUpperCase(),
        name: item.descricaoFornecedor,
        brand: item.marcaDefinida ?? "",
        category: "Importado XML",
        price: item.precoVendaDefinido ? formatCurrency(Number(item.precoVendaDefinido)) : "",
        availableStock: Number(item.quantidade),
        minimumStock: 1,
        status: Number(item.quantidade) > 0 ? "Em estoque" : "Zerado",
        ecommerceVisible: false,
        originalCode: item.codigoFornecedor,
        barcode: item.gtin || "",
        unit: item.unidade,
        type: "Peça",
        shortDescription: item.descricaoFornecedor,
        technicalDescription: `Importado da NF-e ${entrada.numero || ""}`.trim(),
        ncm: item.ncm || "",
        cest: item.cest || "",
        origin: "",
        cfopInState: item.cfop || "",
        cfopOutState: "",
        icmsCst: "",
        icmsRate: "",
        ipiCst: "",
        ipiRate: "",
        pisCst: "",
        pisRate: "",
        cofinsCst: "",
        cofinsRate: "",
        costValue: formatCurrency(Number(item.valorUnitario)),
        lastCost: formatCurrency(Number(item.valorUnitario)),
        minimumPrice: item.precoMinimoDefinido ? formatCurrency(Number(item.precoMinimoDefinido)) : "",
        maxDiscount: "10",
        warehouse: "Galpão LEM-1 · Estoque geral",
        location: "",
        reservedStock: "0",
        maxStock: String(Math.ceil(Math.max(Number(item.quantidade) * 2, 1))),
        allowNegativeStock: false,
        allowBackorder: false,
        supplier: entrada.fornecedor?.razaoSocial || "",
        supplierCode: item.codigoFornecedor,
        purchaseUnit: item.unidade,
        purchaseConversion: String(Number(item.fatorConversao ?? 1)),
        leadTime: "",
        minimumPurchase: "1",
        storeTitle: item.descricaoFornecedor,
        storeDescription: "",
        showPrice: false,
        showStock: false,
        allowOnlineSale: false,
        allowQuote: true,
        seoSlug: slugify(`${item.codigoFornecedor}-${item.descricaoFornecedor}`),
        applications: ""
      },
      matchedProductId: item.produtoId ?? undefined,
      action: item.produtoId ? "update" as const : "create" as const,
      confidence: Number(item.confiancaVinculo ?? 0),
      review: item.revisarVinculo,
      fatorConversao: Number(item.fatorConversao ?? 1),
      unidadeVenda: item.unidadeVenda ?? item.unidade,
      salePrice: item.precoVendaDefinido ? String(Number(item.precoVendaDefinido)).replace(".", ",") : "",
      minimumPrice: item.precoMinimoDefinido ? String(Number(item.precoMinimoDefinido)).replace(".", ",") : "",
      brand: item.marcaDefinida ?? "",
      finalidade: item.finalidade ?? undefined,
      finalidadeOrigem: item.finalidadeOrigem ?? undefined,
      cfopEntradaDerivado: item.cfopEntradaDerivado ?? undefined,
      movimentaEstoque: item.movimentaEstoque,
      // Impostos lidos do XML da NF-e (conferência da tributação que veio do fornecedor).
      impostos: (item.impostos ?? []).map((imp) => ({
        tributo: imp.tributo,
        cst: imp.cst,
        csosn: imp.csosn,
        base: Number(imp.baseCalculo ?? 0),
        aliquota: Number(imp.aliquota ?? 0),
        valor: Number(imp.valor ?? 0),
        // Crédito de ICMS de fornecedor do Simples (LC 123, art. 23).
        credSnAliquota: Number(imp.aliquotaCredSn ?? 0),
        credSnValor: Number(imp.valorCredSn ?? 0)
      }))
    }))
  };
}

function normalizeInstallments(input: FiscalEntryInstallmentInput[] | undefined, totalNota: number) {
  const installments = (input ?? [])
    .map((installment, index) => ({
      number: String(installment.number || index + 1),
      dueDate: installment.dueDate ? new Date(`${installment.dueDate.slice(0, 10)}T12:00:00.000Z`) : null,
      value: Number(installment.value ?? 0),
      paymentMethod: installment.paymentMethod?.trim() || null,
      origin: installment.paymentMethod === "Conforme XML" ? "XML" : "MANUAL"
    }))
    .filter((installment) => installment.value > 0);

  if (!installments.length) {
    throw new Error("Informe ao menos uma parcela financeira antes de confirmar o lançamento.");
  }

  const invalidDueDate = installments.find((installment) => !installment.dueDate || Number.isNaN(installment.dueDate.getTime()));

  if (invalidDueDate) {
    throw new Error(`Informe um vencimento válido para a parcela ${invalidDueDate.number}.`);
  }

  const totalInstallments = installments.reduce((total, installment) => total + installment.value, 0);

  if (Math.abs(totalInstallments - totalNota) > 0.05) {
    throw new Error(`O total das parcelas (${formatCurrency(totalInstallments)}) deve fechar com o total da NF-e (${formatCurrency(totalNota)}).`);
  }

  return installments.map((installment) => ({
    number: installment.number,
    dueDate: installment.dueDate as Date,
    value: installment.value,
    paymentMethod: installment.paymentMethod,
    origin: installment.origin
  }));
}

async function upsertProductFiscalFromEntryItem(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  produtoId: string,
  item: { ncm: string | null; cest: string | null; finalidade?: FinalidadeEntrada | null; st?: boolean }
) {
  if (!item.ncm) {
    return;
  }

  // Memoriza a finalidade e a marca de ST no perfil fiscal do produto para que próximas entradas
  // — e a emissão de venda — herdem a classificação automaticamente (camada de maior confiança).
  // ST só é marcada (nunca desmarcada aqui): basta uma entrada substituída para o item ser ST.
  await tx.produtoFiscal.upsert({
    where: { produtoId },
    update: {
      ncm: item.ncm,
      cest: item.cest || null,
      regraTributariaId: undefined,
      ...(item.finalidade ? { finalidadePadrao: item.finalidade } : {}),
      ...(item.st ? { icmsSt: true } : {})
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId,
      ncm: item.ncm,
      cest: item.cest || null,
      finalidadePadrao: item.finalidade ?? null,
      icmsSt: item.st ?? false
    }
  });
}

async function resolveFornecedor(tx: Prisma.TransactionClient, scope: TenantScope, document?: string, name?: string, uf?: string) {
  if (!document) {
    return null;
  }

  // Grava a UF do fornecedor (do XML): é ela vs a UF da empresa que define interno x interestadual
  // ao derivar/recalcular o CFOP de entrada — de forma robusta, independente de overrides manuais.
  const ufNorm = uf?.trim().toUpperCase() || undefined;

  return tx.fornecedor.upsert({
    where: {
      tenantId_empresaId_documento: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        documento: document
      }
    },
    update: {
      razaoSocial: name || document,
      nomeFantasia: name || undefined,
      uf: ufNorm
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      documento: document,
      razaoSocial: name || document,
      nomeFantasia: name || undefined,
      uf: ufNorm
    }
  });
}

async function matchProduct(tx: Prisma.TransactionClient, scope: TenantScope, fornecedorId: string | undefined, item: ParsedNfeItem) {
  const sku = item.supplierCode.toUpperCase();

  const bySku = await tx.produto.findFirst({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      sku,
      ativo: true
    }
  });

  if (bySku) {
    return { product: bySku, confidence: 100, review: false };
  }

  if (item.gtin) {
    const byGtin = await tx.produto.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        gtin: item.gtin,
        ativo: true
      }
    });

    if (byGtin) {
      return { product: byGtin, confidence: 92, review: false };
    }
  }

  if (fornecedorId) {
    const bySupplierCode = await tx.produtoFornecedor.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        fornecedorId,
        codigoFornecedor: item.supplierCode,
        ativo: true
      },
      include: { produto: true }
    });

    if (bySupplierCode) {
      return { product: bySupplierCode.produto, confidence: 95, review: false };
    }
  }

  return { product: null, confidence: 0, review: true };
}

export async function importNfeXml(scope: TenantScope, xmlText: string) {
  const parsed = parseNfeXml(xmlText);
  const checksum = nfeChecksum(xmlText);

  return prisma.$transaction(async (tx) => {
    const fornecedor = await resolveFornecedor(tx, scope, parsed.supplierDocument, parsed.supplierName, parsed.supplierUf);
    // UF e regime da empresa: necessários para derivar CFOP de entrada (interno x interestadual)
    // e o direito a crédito por finalidade. Fallbacks seguros se não configurados.
    const empresa = await tx.empresa.findUnique({
      where: { id: scope.empresaId },
      select: { enderecoUf: true, regimeTributario: true }
    });
    const empresaUf = empresa?.enderecoUf?.trim().toUpperCase() || null;
    const regime = empresa?.regimeTributario ?? "SIMPLES_NACIONAL";
    const agora = new Date();
    const xmlImportacao = await tx.xmlImportacao.upsert({
      where: {
        tenantId_empresaId_checksum: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          checksum
        }
      },
      update: {
        status: "VALIDADO",
        mensagemErro: null
      },
      create: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        chaveAcesso: parsed.accessKey,
        numero: parsed.number,
        serie: parsed.series,
        emitidaEm: parsed.issuedAt,
        emitenteDocumento: parsed.supplierDocument,
        emitenteNome: parsed.supplierName,
        status: "VALIDADO",
        checksum,
        xmlOriginal: xmlText
      }
    });

    const entradasEmConferencia = await tx.entradaFiscal.findMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        xmlImportacaoId: xmlImportacao.id,
        status: "AGUARDANDO_CONFERENCIA"
      },
      select: { id: true }
    });
    const entradaIds = entradasEmConferencia.map((entrada) => entrada.id);

    if (entradaIds.length) {
      const itensEmConferencia = await tx.entradaFiscalItem.findMany({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          entradaFiscalId: { in: entradaIds }
        },
        select: { id: true }
      });
      const itemIds = itensEmConferencia.map((item) => item.id);

      if (itemIds.length) {
        await tx.entradaFiscalItemImposto.deleteMany({
          where: {
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            entradaFiscalItemId: { in: itemIds }
          }
        });
        await tx.entradaFiscalItem.deleteMany({
          where: {
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            id: { in: itemIds }
          }
        });
      }

      await tx.entradaFiscalParcela.deleteMany({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          entradaFiscalId: { in: entradaIds }
        }
      });

      await tx.entradaFiscal.deleteMany({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          id: { in: entradaIds }
        }
      });
    }

    const entrada = await tx.entradaFiscal.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ambiente: scope.ambiente ?? "HOMOLOGACAO",
        fornecedorId: fornecedor?.id,
        xmlImportacaoId: xmlImportacao.id,
        chaveAcesso: parsed.accessKey,
        numero: parsed.number,
        serie: parsed.series,
        modelo: parsed.model,
        cfopPrincipal: parsed.mainCfop,
        status: "AGUARDANDO_CONFERENCIA",
        emitidaEm: parsed.issuedAt,
        recebidaEm: new Date(),
        totalProdutos: parsed.totalProducts,
        totalNota: parsed.totalInvoice,
        valorFrete: parsed.freightValue,
        valorSeguro: parsed.insuranceValue,
        valorDesconto: parsed.discountValue,
        outrasDespesas: parsed.otherExpenses,
        informacoesComplementares: parsed.infCpl ?? null
      }
    });

    const responseItems = [];
    // Regras De/Para de finalidade: carregadas UMA vez para todos os itens (evita N queries
    // idênticas dentro da transação, principal causa de timeout em notas com muitos itens).
    const regrasFinalidade = await loadFinalidadeRules(tx, scope, agora);
    // Rateio do crédito do Simples informado só no TEXTO (infCpl) — apenas quando NENHUM item
    // trouxe os campos estruturados (pCredSN/vCredICMSSN).
    const temCredSnEstruturado = parsed.items.some((i) => i.taxes.some((t) => (t.credSnValue ?? 0) > 0));
    const credSnDoItem = (tax: (typeof parsed.items)[number]["taxes"][number], itemTotal: number): number | null =>
      tax.credSnValue ??
      (tax.tax === "ICMS" && !temCredSnEstruturado && parsed.creditoSimplesInfCpl > 0 && parsed.totalProducts > 0
        ? Math.round(((itemTotal / parsed.totalProducts) * parsed.creditoSimplesInfCpl + Number.EPSILON) * 100) / 100
        : null);

    for (const item of parsed.items) {
      const match = await matchProduct(tx, scope, fornecedor?.id, item);

      // Finalidade do item (memória do produto → regra De/Para → heurística) e seus efeitos:
      // CFOP de entrada correto, se movimenta estoque e quais tributos são recuperáveis.
      const finalidadeRes = await resolveFinalidadeForItem(
        tx,
        scope,
        { ncm: item.ncm, cfopOrigem: item.cfop, descricao: item.description, produtoId: match.product?.id },
        fornecedor?.id ?? null,
        agora,
        regrasFinalidade
      );
      const icms = item.taxes.find((tax) => tax.tax === "ICMS");
      // ST detectada pelo CST/CSOSN OU pelo CFOP do XML (ex.: 5403/5405 = revenda com ST) —
      // o CFOP cobre o caso em que o CST do XML vem fora do padrão.
      const st = isSubstituicaoTributaria({ cstIcms: icms?.cst ?? null, csosn: icms?.csosn ?? null }) || cfopIndicaSt(item.cfop);
      const interestadual = Boolean(empresaUf && parsed.supplierUf && empresaUf !== parsed.supplierUf);
      const cfopEntrada = resolveCfopEntrada(finalidadeRes.finalidade, { interestadual, st });
      const movimentaEstoque = finalidadeRes.finalidade === "REVENDA" || finalidadeRes.finalidade === "INDUSTRIALIZACAO";

      const createdItem = await tx.entradaFiscalItem.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          entradaFiscalId: entrada.id,
          produtoId: match.product?.id,
          itemNumero: item.itemNumber,
          codigoFornecedor: item.supplierCode,
          descricaoFornecedor: item.description,
          gtin: item.gtin,
          ncm: item.ncm,
          cest: item.cest,
          cfop: item.cfop,
          unidade: item.unit,
          quantidade: item.quantity,
          valorUnitario: item.unitValue,
          valorTotal: item.totalValue,
          valorDesconto: item.discountValue,
          // Conversão de embalagem sugerida pelo XML (qTrib/qCom); editável na conferência.
          fatorConversao: item.suggestedConversion && item.suggestedConversion > 0 ? item.suggestedConversion : 1,
          unidadeVenda: item.suggestedConversion && item.suggestedConversion > 1 ? (item.taxableUnit ?? null) : null,
          produtoVinculadoAutomaticamente: Boolean(match.product),
          confiancaVinculo: match.confidence,
          revisarVinculo: match.review,
          finalidade: finalidadeRes.finalidade,
          finalidadeSugerida: finalidadeRes.finalidade,
          finalidadeOrigem: finalidadeRes.origem,
          cfopEntradaDerivado: cfopEntrada,
          movimentaEstoque
        }
      });

      if (item.taxes.length) {
        await tx.entradaFiscalItemImposto.createMany({
          data: item.taxes.map((tax) => ({
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            entradaFiscalItemId: createdItem.id,
            tributo: tax.tax,
            cst: tax.cst,
            csosn: tax.csosn,
            baseCalculo: tax.base,
            aliquota: tax.rate,
            valor: tax.value,
            recuperavel: creditoPorFinalidade(finalidadeRes.finalidade, regime, tax.tax, { st }).recuperavel,
            // Crédito do Simples (LC 123): campos próprios do XML ou, sem eles, rateio do
            // valor mencionado no texto das informações complementares.
            aliquotaCredSn: tax.credSnRate ?? null,
            valorCredSn: credSnDoItem(tax, item.totalValue),
            dadosOriginais: tax.raw as Prisma.InputJsonValue
          }))
        });
      }

      responseItems.push({
        id: createdItem.id,
        importedProduct: {
          id: match.product?.id ?? `entrada-${createdItem.id}`,
          sku: item.supplierCode.toUpperCase(),
          name: item.description,
          brand: "",
          category: "Importado XML",
          price: "",
          availableStock: item.quantity,
          minimumStock: 1,
          status: item.quantity > 0 ? "Em estoque" : "Zerado",
          ecommerceVisible: false,
          originalCode: item.supplierCode,
          barcode: item.gtin || "",
          unit: item.unit,
          type: "Peça",
          shortDescription: item.description,
          technicalDescription: `Importado da NF-e ${parsed.number || ""}`.trim(),
          ncm: item.ncm || "",
          cest: item.cest || "",
          origin: "",
          cfopInState: item.cfop || "",
          cfopOutState: "",
          icmsCst: "",
          icmsRate: "",
          ipiCst: "",
          ipiRate: "",
          pisCst: "",
          pisRate: "",
          cofinsCst: "",
          cofinsRate: "",
          costValue: new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(item.unitValue),
          lastCost: new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(item.unitValue),
          minimumPrice: "",
          maxDiscount: "10",
          warehouse: "Galpão LEM-1 · Estoque geral",
          location: "",
          reservedStock: "0",
          maxStock: String(Math.ceil(Math.max(item.quantity * 2, 1))),
          allowNegativeStock: false,
          allowBackorder: false,
          supplier: parsed.supplierName || "",
          supplierCode: item.supplierCode,
          purchaseUnit: item.unit,
          purchaseConversion: String(item.suggestedConversion && item.suggestedConversion > 0 ? item.suggestedConversion : 1),
          leadTime: "",
          minimumPurchase: "1",
          storeTitle: item.description,
          storeDescription: "",
          showPrice: false,
          showStock: false,
          allowOnlineSale: false,
          allowQuote: true,
          seoSlug: slugify(`${item.supplierCode}-${item.description}`),
          applications: ""
        },
        matchedProductId: match.product?.id,
        action: match.product ? "update" : "create",
        confidence: match.confidence,
        review: match.review,
        fatorConversao: item.suggestedConversion && item.suggestedConversion > 0 ? item.suggestedConversion : 1,
        unidadeVenda: item.suggestedConversion && item.suggestedConversion > 1 ? (item.taxableUnit ?? "UN") : (item.unit || "UN"),
        finalidade: finalidadeRes.finalidade,
        finalidadeOrigem: finalidadeRes.origem,
        cfopEntradaDerivado: cfopEntrada,
        movimentaEstoque,
        // Impostos do XML na RESPOSTA da importação — o wizard exibe o crédito do Simples
        // imediatamente após o upload (antes só aparecia ao reabrir a conferência).
        impostos: item.taxes.map((tax) => ({
          tributo: tax.tax,
          cst: tax.cst ?? null,
          csosn: tax.csosn ?? null,
          base: tax.base ?? 0,
          aliquota: tax.rate ?? 0,
          valor: tax.value ?? 0,
          credSnAliquota: tax.credSnRate ?? 0,
          credSnValor: credSnDoItem(tax, item.totalValue) ?? 0
        }))
      });
    }

    if (parsed.installments.length) {
      await tx.entradaFiscalParcela.createMany({
        data: parsed.installments.map((installment, index) => ({
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          entradaFiscalId: entrada.id,
          numero: installment.number || String(index + 1),
          vencimento: installment.dueDate ?? new Date(),
          valor: installment.value,
          formaPagamento: "Conforme XML",
          origem: "XML"
        }))
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "EntradaFiscal",
      entidadeId: entrada.id,
      acao: "IMPORT_XML",
      payload: { numero: parsed.number, fornecedor: parsed.supplierName, itens: parsed.items.length }
    });

    return {
      id: entrada.id,
      invoice: parsed.number,
      supplier: parsed.supplierName,
      accessKey: parsed.accessKey,
      series: parsed.series,
      model: parsed.model,
      issuedAt: parsed.issuedAt?.toISOString() ?? null,
      supplierDocument: parsed.supplierDocument,
      mainCfop: parsed.mainCfop,
      totals: {
        products: parsed.totalProducts,
        invoice: parsed.totalInvoice,
        freight: parsed.freightValue,
        insurance: parsed.insuranceValue,
        discount: parsed.discountValue,
        otherExpenses: parsed.otherExpenses
      },
      installments: parsed.installments.map((installment, index) => ({
        number: installment.number || String(index + 1),
        dueDate: installment.dueDate?.toISOString() ?? null,
        value: installment.value
      })),
      status: entrada.status,
      receivedAt: entrada.recebidaEm?.toISOString() ?? new Date().toISOString(),
      infCpl: parsed.infCpl,
      items: responseItems
    };
  }, FISCAL_BATCH_TRANSACTION_OPTIONS);
}

export async function processFiscalEntry(
  scope: TenantScope,
  entradaFiscalId: string,
  input?: { installments?: FiscalEntryInstallmentInput[] }
) {
  // Categorização automática por IA — feita FORA da transação (chamada externa). Mapa itemId→categoria.
  const itensParaCategorizar = await prisma.entradaFiscalItem.findMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, entradaFiscalId },
    select: { id: true, descricaoFornecedor: true }
  });
  const categoriasIa = await sugerirCategoriasEntrada(
    scope,
    itensParaCategorizar.map((i) => ({ id: i.id, descricao: i.descricaoFornecedor }))
  ).catch(() => ({} as Record<string, string>));

  return prisma.$transaction(async (tx) => {
    const entrada = await tx.entradaFiscal.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        id: entradaFiscalId
      },
      include: {
        fornecedor: true,
        xmlImportacao: true,
        parcelas: {
          orderBy: { vencimento: "asc" }
        },
        itens: { include: { impostos: true } }
      }
    });

    if (!entrada) {
      throw new Error("Entrada fiscal não encontrada.");
    }

    // Só permite processar entradas que ainda estão na fase de conferência.
    // Qualquer outro status (ESTOQUE_PROCESSADO, ESTORNADA, etc.) é barrado para evitar
    // reprocessamento, que duplicaria estoque e contas a pagar. Em especial, após um estorno
    // o status vira ESTORNADA e NÃO pode ser reprocessado.
    if (entrada.status !== "AGUARDANDO_CONFERENCIA" && entrada.status !== "CONFERIDA") {
      if (entrada.status === "ESTOQUE_PROCESSADO") {
        throw new Error("Entrada fiscal já processada.");
      }
      if (entrada.status === "ESTORNADA") {
        throw new Error("Entrada fiscal estornada não pode ser reprocessada.");
      }
      throw new Error(`Entrada fiscal no status ${entrada.status} não pode ser processada.`);
    }

    const installmentInput = input?.installments?.length
      ? input.installments
      : entrada.parcelas.map((parcela) => ({
          number: parcela.numero,
          dueDate: parcela.vencimento.toISOString(),
          value: Number(parcela.valor),
          paymentMethod: parcela.formaPagamento
        }));
    const normalizedInstallments = normalizeInstallments(installmentInput, Number(entrada.totalNota));

    await tx.entradaFiscalParcela.deleteMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        entradaFiscalId: entrada.id
      }
    });

    const parcelas = [];

    for (const installment of normalizedInstallments) {
      const parcela = await tx.entradaFiscalParcela.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          entradaFiscalId: entrada.id,
          numero: installment.number,
          vencimento: installment.dueDate,
          valor: installment.value,
          formaPagamento: installment.paymentMethod,
          origem: installment.origin
        }
      });
      parcelas.push(parcela);
    }

    const deposito = await tx.deposito.upsert({
      where: {
        tenantId_empresaId_nome: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          nome: "Galpão LEM-1 · Estoque geral"
        }
      },
      update: {},
      create: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: "Galpão LEM-1 · Estoque geral",
        uf: "BA"
      }
    });
    // Categoria por produto: usa a sugerida pela IA (ou "Sem categoria"); faz upsert sob demanda,
    // com cache por slug para não repetir a consulta dentro do loop.
    const categoriaCache = new Map<string, string>();
    async function categoriaIdPara(nome: string): Promise<string> {
      const nomeFinal = nome.trim() || "Sem categoria";
      const slug = slugify(nomeFinal) || "sem-categoria";
      const cacheado = categoriaCache.get(slug);
      if (cacheado) return cacheado;
      const cat = await tx.produtoCategoria.upsert({
        where: { tenantId_empresaId_slug: { tenantId: scope.tenantId, empresaId: scope.empresaId, slug } },
        update: { nome: nomeFinal },
        create: { tenantId: scope.tenantId, empresaId: scope.empresaId, nome: nomeFinal, slug }
      });
      categoriaCache.set(slug, cat.id);
      return cat.id;
    }
    let created = 0;
    let updated = 0;

    for (const item of entrada.itens) {
      const movimentaEstoque = item.movimentaEstoque;
      let produtoId = item.produtoId;
      // Conversão de embalagem: comprou em fardo/caixa (item.unidade, item.quantidade comercial),
      // mas estoca/vende unitário. O estoque entra em unidade de venda (quantidade × fator) e o
      // custo unitário vira valorUnitario ÷ fator. valorTotal não muda (qtd×custo permanece igual).
      const fatorConv = Number(item.fatorConversao) > 0 ? Number(item.fatorConversao) : 1;
      const qtdEstoque = Number(item.quantidade) * fatorConv;
      const custoUnitConv = Number(item.valorUnitario) / fatorConv;
      const unidadeVendaItem = item.unidadeVenda?.trim() || item.unidade;
      // Mercadoria substituída (ICMS-ST já recolhido): memorizada no produto para que a revenda
      // saia sem ICMS próprio (CST 60 / CSOSN 500) e com CFOP de ST.
      const icmsItem = item.impostos.find((imp) => imp.tributo === "ICMS");
      // ST detectada pelo CST/CSOSN OU pelo CFOP do XML (ex.: 5403/5405 = revenda com ST).
      const itemSt =
        isSubstituicaoTributaria({ cstIcms: icmsItem?.cst ?? null, csosn: icmsItem?.csosn ?? null }) || cfopIndicaSt(item.cfop);
      const itemFiscal = { ncm: item.ncm, cest: item.cest, finalidade: item.finalidade, st: itemSt };

      if (!produtoId) {
        // Uso/consumo e imobilizado sem produto vinculado não viram SKU nem estoque: entram
        // apenas como obrigação financeira (ContaPagar, gerada adiante). CIAP do ativo é fase posterior.
        if (!movimentaEstoque) {
          continue;
        }

        // Insumo (Industrialização) NÃO é revendido — é consumido na produção; quem tem preço de
        // venda é o produto acabado. Só exigimos preço para itens vendáveis (revenda e congêneres).
        const ehInsumo = item.finalidade === "INDUSTRIALIZACAO" || item.finalidade === "RETORNO_INDUSTRIALIZACAO";
        if (!ehInsumo && (!item.precoVendaDefinido || Number(item.precoVendaDefinido) <= 0)) {
          throw new Error(`Informe o preço de venda do novo SKU ${item.codigoFornecedor} antes de lançar a entrada fiscal.`);
        }

        const marca = item.marcaDefinida?.trim()
          ? await tx.produtoMarca.upsert({
              where: {
                tenantId_empresaId_nome: {
                  tenantId: scope.tenantId,
                  empresaId: scope.empresaId,
                  nome: item.marcaDefinida.trim()
                }
              },
              update: {},
              create: {
                tenantId: scope.tenantId,
                empresaId: scope.empresaId,
                nome: item.marcaDefinida.trim()
              }
            })
          : null;

        const product = await tx.produto.create({
          data: {
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            sku: item.codigoFornecedor.toUpperCase(),
            nome: item.descricaoFornecedor,
            descricao: `Criado pela entrada fiscal ${entrada.numero || entrada.id}.`,
            tipo: item.finalidade === "INDUSTRIALIZACAO" ? "INSUMO" : "PRODUTO",
            codigoOriginal: item.codigoFornecedor,
            gtin: item.gtin,
            categoriaId: await categoriaIdPara(categoriasIa[item.id] ?? ""),
            marcaId: marca?.id,
            unidade: unidadeVendaItem,
            unidadeCompra: item.unidade,
            fatorConversaoCompra: fatorConv,
            ncm: item.ncm,
            cest: item.cest,
            // CFOP de VENDA do produto conforme a finalidade (não o CFOP do fornecedor).
            // ST fica null aqui para a emissão derivar 5405/6404.
            cfop: cfopVendaPadrao(item.finalidade, { st: itemSt }),
            precoCusto: custoUnitConv,
            ultimoCusto: custoUnitConv,
            custoMedio: custoUnitConv,
            // Insumo sem preço de venda informado entra com 0 (não é vendido diretamente).
            precoVenda: item.precoVendaDefinido ?? 0,
            precoMinimo: item.precoMinimoDefinido ?? item.precoVendaDefinido ?? 0,
            visivelEcommerce: false
          }
        });
        produtoId = product.id;
        created += 1;

        await tx.entradaFiscalItem.update({
          where: { id: item.id },
          data: {
            produtoId,
            produtoVinculadoAutomaticamente: true,
            confiancaVinculo: 100,
            revisarVinculo: false
          }
        });
      } else {
        updated += 1;
      }

      // Itens vinculados que não movimentam estoque (uso/consumo, imobilizado): apenas memorizam
      // a finalidade no perfil fiscal e seguem — sem saldo, custo médio ou movimento de estoque.
      if (!movimentaEstoque) {
        await upsertProductFiscalFromEntryItem(tx, scope, produtoId, itemFiscal);
        continue;
      }

      const product = await tx.produto.findFirst({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          id: produtoId
        },
        select: {
          id: true,
          precoCusto: true,
          custoMedio: true,
          cfop: true
        }
      });

      if (!product) {
        throw new Error(`Produto vinculado ao item ${item.codigoFornecedor} não foi encontrado na empresa atual.`);
      }

      if (entrada.fornecedorId) {
        await tx.produtoFornecedor.upsert({
          where: {
            tenantId_empresaId_fornecedorId_codigoFornecedor: {
              tenantId: scope.tenantId,
              empresaId: scope.empresaId,
              fornecedorId: entrada.fornecedorId,
              codigoFornecedor: item.codigoFornecedor
            }
          },
          update: {
            produtoId,
            descricaoFornecedor: item.descricaoFornecedor,
            gtinFornecedor: item.gtin,
            unidadeCompra: item.unidade,
            custoUltimaCompra: item.valorUnitario,
            ativo: true
          },
          create: {
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            produtoId,
            fornecedorId: entrada.fornecedorId,
            codigoFornecedor: item.codigoFornecedor,
            descricaoFornecedor: item.descricaoFornecedor,
            gtinFornecedor: item.gtin,
            unidadeCompra: item.unidade,
            custoUltimaCompra: item.valorUnitario,
            principal: true
          }
        });
      }

      const previous = await tx.estoqueSaldo.findUnique({
        where: {
          tenantId_empresaId_produtoId_depositoId_controleKey: {
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            produtoId,
            depositoId: deposito.id,
            controleKey: "SEM_CONTROLE"
          }
        }
      });
      const previousQuantity = Number(previous?.quantidade ?? 0);
      // Estoque e custo na unidade de venda (já convertidos pelo fator de embalagem).
      const nextQuantity = previousQuantity + qtdEstoque;
      const previousAverageCost = Number(product.custoMedio ?? product.precoCusto ?? custoUnitConv);
      const incomingQuantity = qtdEstoque;
      const incomingCost = custoUnitConv;
      const weightedAverageCost = nextQuantity > 0
        ? ((previousQuantity * previousAverageCost) + (incomingQuantity * incomingCost)) / nextQuantity
        : incomingCost;

      // CFOP de venda conforme a finalidade. Só preenche quando o produto ainda NÃO tem CFOP
      // (não sobrescreve configuração que o contador já fez no produto existente).
      const cfopVenda = cfopVendaPadrao(item.finalidade, { st: itemSt });
      const definirCfop = cfopVenda && !product.cfop;
      // Em produto existente, registra a embalagem desta compra (unidade de compra + fator) para
      // futuras compras/relatórios herdarem a conversão correta.
      const definirEmbalagem = fatorConv > 1;
      await tx.produto.update({
        where: { id: produtoId },
        data: {
          ultimoCusto: custoUnitConv,
          precoCusto: custoUnitConv,
          custoMedio: weightedAverageCost,
          ncm: item.ncm,
          cest: item.cest,
          ...(definirCfop ? { cfop: cfopVenda } : {}),
          ...(definirEmbalagem ? { unidadeCompra: item.unidade, fatorConversaoCompra: fatorConv } : {})
        }
      });
      await upsertProductFiscalFromEntryItem(tx, scope, produtoId, itemFiscal);

      await tx.estoqueSaldo.upsert({
        where: {
          tenantId_empresaId_produtoId_depositoId_controleKey: {
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            produtoId,
            depositoId: deposito.id,
            controleKey: "SEM_CONTROLE"
          }
        },
        update: { quantidade: nextQuantity },
        create: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          produtoId,
          depositoId: deposito.id,
          controleKey: "SEM_CONTROLE",
          quantidade: nextQuantity
        }
      });

      await tx.estoqueMovimento.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          produtoId,
          depositoId: deposito.id,
          tipo: "ENTRADA",
          quantidade: qtdEstoque,
          saldoAntes: previousQuantity,
          saldoDepois: nextQuantity,
          custoUnitario: custoUnitConv,
          custoTotal: item.valorTotal,
          documentoTipo: "ENTRADA_FISCAL",
          documentoId: entrada.id,
          idempotencyKey: `entrada-fiscal:${entrada.id}:${item.id}`,
          observacoes: `Entrada fiscal NF-e ${entrada.numero || entrada.chaveAcesso || entrada.id}.`
        }
      });
    }

    for (const parcela of parcelas) {
      await tx.contaPagar.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          ambiente: scope.ambiente ?? "HOMOLOGACAO",
          fornecedorId: entrada.fornecedorId,
          entradaFiscalId: entrada.id,
          entradaFiscalParcelaId: parcela.id,
          descricao: `NF-e ${entrada.numero || entrada.chaveAcesso || entrada.id} - parcela ${parcela.numero}`,
          numeroDocumento: entrada.numero,
          formaPagamento: parcela.formaPagamento,
          origem: "ENTRADA_FISCAL",
          vencimento: parcela.vencimento,
          valor: parcela.valor,
          status: "ABERTO"
        }
      });
    }

    // CIAP (bloco G do SPED): itens IMOBILIZADOS viram bem do ativo com o crédito de ICMS
    // controlado em 48 parcelas. Cria o bem automaticamente (idempotente por código).
    for (const item of entrada.itens) {
      if (item.finalidade !== "IMOBILIZADO") continue;
      const icms = item.impostos.find((imp) => imp.tributo === "ICMS");
      // Crédito passível: ICMS destacado ou, em fornecedor do Simples, o crédito da LC 123.
      const valorIcmsOp = Number(icms?.valor ?? 0) || Number(icms?.valorCredSn ?? 0);
      if (valorIcmsOp <= 0) continue;
      const codigoBem = `BEM-${(entrada.numero ?? entrada.id.slice(-6)).toString()}-${item.itemNumero}`;
      await tx.ciapBem.upsert({
        where: { tenantId_empresaId_codigo: { tenantId: scope.tenantId, empresaId: scope.empresaId, codigo: codigoBem } },
        update: {},
        create: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          codigo: codigoBem,
          descricao: item.descricaoFornecedor,
          valorIcmsOp,
          parcelasTotal: 48,
          imobilizadoEm: entrada.recebidaEm ?? entrada.emitidaEm ?? new Date(),
          fornecedorDocumento: entrada.fornecedor?.documento ?? null,
          fornecedorNome: entrada.fornecedor?.razaoSocial ?? null,
          docModelo: entrada.modelo,
          docSerie: entrada.serie,
          docNumero: entrada.numero,
          chaveAcesso: entrada.chaveAcesso,
          docEmitidaEm: entrada.emitidaEm,
          itemCodigo: item.codigoFornecedor,
          itemQuantidade: item.quantidade,
          itemUnidade: item.unidade,
          entradaFiscalItemId: item.id,
          observacoes: "Criado automaticamente ao processar a entrada (finalidade Imobilizado)."
        }
      });
    }

    await tx.entradaFiscal.update({
      where: { id: entrada.id },
      data: { status: "ESTOQUE_PROCESSADO" }
    });

    if (entrada.xmlImportacaoId) {
      await tx.xmlImportacao.update({
        where: { id: entrada.xmlImportacaoId },
        data: { status: "PROCESSADO" }
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "EntradaFiscal",
      entidadeId: entrada.id,
      acao: "PROCESS_STOCK",
      payload: { created, updated, itens: entrada.itens.length, contasPagar: parcelas.length }
    });

    return { id: entrada.id, created, updated, contasPagar: parcelas.length };
  }, FISCAL_BATCH_TRANSACTION_OPTIONS);
}

export async function getFiscalEntryDraft(scope: TenantScope, entradaFiscalId: string) {
  const entrada = await prisma.entradaFiscal.findFirst({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      id: entradaFiscalId
    },
    include: {
      fornecedor: true,
      xmlImportacao: {
        select: { xmlOriginal: true }
      },
      parcelas: {
        orderBy: { vencimento: "asc" }
      },
      itens: {
        orderBy: { itemNumero: "asc" },
        include: { impostos: true }
      }
    }
  });

  if (!entrada) {
    throw new Error("Entrada fiscal não encontrada.");
  }

  return buildFiscalEntryDraft(entrada);
}

export async function reverseFiscalEntry(scope: TenantScope, entradaFiscalId: string, motivo?: string) {
  return prisma.$transaction(async (tx) => {
    const entrada = await tx.entradaFiscal.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        id: entradaFiscalId
      },
      include: {
        contasPagar: true,
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                sku: true,
                precoCusto: true,
                custoMedio: true,
                permiteEstoqueNegativo: true
              }
            }
          }
        }
      }
    });

    if (!entrada) {
      throw new Error("Entrada fiscal não encontrada.");
    }

    if (entrada.status !== "ESTOQUE_PROCESSADO") {
      throw new Error("Somente entrada fiscal registrada pode ser estornada.");
    }

    const paidAccount = entrada.contasPagar.find((conta) => conta.status === "PAGO");

    if (paidAccount) {
      throw new Error("Não é possível estornar a entrada fiscal porque existe conta a pagar já baixada.");
    }

    const deposito = await tx.deposito.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: "Galpão LEM-1 · Estoque geral"
      }
    });

    if (!deposito) {
      throw new Error("Depósito padrão da entrada fiscal não encontrado.");
    }

    let reversedItems = 0;

    for (const item of entrada.itens) {
      if (!item.produtoId || !item.produto) {
        throw new Error(`Item ${item.codigoFornecedor} não possui produto vinculado para estorno.`);
      }

      const saldo = await tx.estoqueSaldo.findUnique({
        where: {
          tenantId_empresaId_produtoId_depositoId_controleKey: {
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            produtoId: item.produtoId,
            depositoId: deposito.id,
            controleKey: "SEM_CONTROLE"
          }
        }
      });
      // Espelha o lançamento: a entrada postou quantidade × fator na unidade de venda, então o
      // estorno devolve a mesma quantidade convertida e usa o custo unitário convertido.
      const fatorConv = Number(item.fatorConversao) > 0 ? Number(item.fatorConversao) : 1;
      const custoUnitConv = Number(item.valorUnitario) / fatorConv;
      const previousQuantity = Number(saldo?.quantidade ?? 0);
      const reversalQuantity = Number(item.quantidade) * fatorConv;
      const nextQuantity = previousQuantity - reversalQuantity;

      if (nextQuantity < 0 && !item.produto.permiteEstoqueNegativo) {
        throw new Error(`Saldo insuficiente para estornar o SKU ${item.produto.sku}. Saldo atual: ${previousQuantity}.`);
      }

      const previousAverageCost = Number(item.produto.custoMedio ?? item.produto.precoCusto ?? custoUnitConv);
      const itemCost = custoUnitConv;
      const nextAverageCost = nextQuantity > 0
        ? ((previousQuantity * previousAverageCost) - (reversalQuantity * itemCost)) / nextQuantity
        : previousAverageCost;

      await tx.estoqueSaldo.upsert({
        where: {
          tenantId_empresaId_produtoId_depositoId_controleKey: {
            tenantId: scope.tenantId,
            empresaId: scope.empresaId,
            produtoId: item.produtoId,
            depositoId: deposito.id,
            controleKey: "SEM_CONTROLE"
          }
        },
        update: { quantidade: nextQuantity },
        create: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          produtoId: item.produtoId,
          depositoId: deposito.id,
          controleKey: "SEM_CONTROLE",
          quantidade: nextQuantity
        }
      });

      await tx.estoqueMovimento.create({
        data: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          produtoId: item.produtoId,
          depositoId: deposito.id,
          tipo: "ESTORNO",
          quantidade: -reversalQuantity,
          saldoAntes: previousQuantity,
          saldoDepois: nextQuantity,
          custoUnitario: custoUnitConv,
          custoTotal: -Number(item.valorTotal),
          documentoTipo: "ESTORNO_ENTRADA_FISCAL",
          documentoId: entrada.id,
          idempotencyKey: `estorno-entrada-fiscal:${entrada.id}:${item.id}`,
          observacoes: motivo?.trim()
            ? `Estorno da NF-e ${entrada.numero || entrada.chaveAcesso || entrada.id}. Motivo: ${motivo.trim()}`
            : `Estorno da NF-e ${entrada.numero || entrada.chaveAcesso || entrada.id}.`
        }
      });

      await tx.produto.update({
        where: { id: item.produtoId },
        data: {
          custoMedio: nextAverageCost
        }
      });

      reversedItems += 1;
    }

    const canceledAccounts = await tx.contaPagar.updateMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        entradaFiscalId: entrada.id,
        status: { not: "PAGO" }
      },
      data: {
        status: "CANCELADO"
      }
    });

    await tx.entradaFiscal.update({
      where: { id: entrada.id },
      data: {
        status: "ESTORNADA",
        observacoes: motivo?.trim()
          ? [entrada.observacoes, `Estornada em ${new Date().toISOString()}. Motivo: ${motivo.trim()}`].filter(Boolean).join("\n")
          : [entrada.observacoes, `Estornada em ${new Date().toISOString()}.`].filter(Boolean).join("\n")
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "EntradaFiscal",
      entidadeId: entrada.id,
      acao: "REVERSE_STOCK",
      payload: {
        motivo: motivo?.trim() || null,
        itens: reversedItems,
        contasPagarCanceladas: canceledAccounts.count
      }
    });

    return {
      id: entrada.id,
      reversedItems,
      canceledPayables: canceledAccounts.count
    };
  }, FISCAL_TRANSACTION_OPTIONS);
}

export async function deleteFiscalEntry(scope: TenantScope, entradaFiscalId: string) {
  return prisma.$transaction(async (tx) => {
    const entrada = await tx.entradaFiscal.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        id: entradaFiscalId
      },
      include: {
        itens: {
          select: { id: true, produtoId: true, produtoVinculadoAutomaticamente: true }
        }
      }
    });

    if (!entrada) {
      throw new Error("Entrada fiscal não encontrada.");
    }

    if (entrada.status === "ESTOQUE_PROCESSADO") {
      throw new Error("Entrada fiscal registrada não pode ser excluída sem estorno de estoque.");
    }

    const itemIds = entrada.itens.map((item) => item.id);
    // Produtos CRIADOS/vinculados automaticamente por esta entrada — candidatos a remover em cascata
    // junto com a entrada (só se não tiverem nenhum outro uso; ver verificação adiante).
    const produtoIdsCandidatos = [
      ...new Set(
        entrada.itens
          .filter((i) => i.produtoVinculadoAutomaticamente && i.produtoId)
          .map((i) => i.produtoId as string)
      )
    ];

    if (itemIds.length) {
      await tx.entradaFiscalItemImposto.deleteMany({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          entradaFiscalItemId: { in: itemIds }
        }
      });
      await tx.entradaFiscalItem.deleteMany({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          id: { in: itemIds }
        }
      });
    }

    await tx.contaPagar.deleteMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        entradaFiscalId: entrada.id
      }
    });

    await tx.entradaFiscalParcela.deleteMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        entradaFiscalId: entrada.id
      }
    });

    await tx.entradaFiscal.delete({
      where: { id: entrada.id }
    });

    // Cascata dos produtos CRIADOS por esta entrada: agora que os itens dela já foram apagados,
    // remove cada produto candidato SE não tiver nenhum outro uso (outra entrada, nota, pedido,
    // orçamento, compra ou ordem de serviço). Caso contrário, preserva o produto.
    let produtosRemovidos = 0;
    for (const produtoId of produtoIdsCandidatos) {
      const [outrasEntradas, notas, pedidos, orcamentos, compras, osPecas] = await Promise.all([
        tx.entradaFiscalItem.count({ where: { produtoId } }),
        tx.notaFiscalItem.count({ where: { produtoId } }),
        tx.pedidoVendaItem.count({ where: { produtoId } }),
        tx.orcamentoItem.count({ where: { produtoId } }),
        tx.pedidoCompraItem.count({ where: { produtoId } }),
        tx.ordemServicoPeca.count({ where: { produtoId } })
      ]);
      if (outrasEntradas || notas || pedidos || orcamentos || compras || osPecas) continue; // em uso → preserva

      await tx.estoqueReserva.deleteMany({ where: { produtoId } });
      await tx.estoqueLote.deleteMany({ where: { produtoId } });
      await tx.estoqueSerie.deleteMany({ where: { produtoId } });
      await tx.estoqueMovimento.deleteMany({ where: { produtoId } });
      await tx.estoqueSaldo.deleteMany({ where: { produtoId } });
      await tx.produtoImagem.deleteMany({ where: { produtoId } });
      await tx.produtoFiscal.deleteMany({ where: { produtoId } });
      await tx.produtoFornecedor.deleteMany({ where: { produtoId } });
      await tx.produtoAplicacao.deleteMany({ where: { produtoId } });
      await tx.tabelaPrecoItem.deleteMany({ where: { produtoId } });
      await tx.inventarioItem.deleteMany({ where: { produtoId } });
      await tx.produto.delete({ where: { id: produtoId } });
      produtosRemovidos++;
    }

    if (entrada.xmlImportacaoId) {
      const remainingEntries = await tx.entradaFiscal.count({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          xmlImportacaoId: entrada.xmlImportacaoId
        }
      });

      if (remainingEntries === 0) {
        await tx.xmlImportacao.delete({
          where: { id: entrada.xmlImportacaoId }
        });
      }
    }

    await createAuditLog(tx, {
      scope,
      entidade: "EntradaFiscal",
      entidadeId: entrada.id,
      acao: "DELETE",
      payload: { numero: entrada.numero, status: entrada.status, itens: itemIds.length, produtosRemovidos }
    });

    return { id: entrada.id, produtosRemovidos };
  }, FISCAL_TRANSACTION_OPTIONS);
}

type FiscalEntryItemLinkInput = {
  produtoId?: string | null;
  criarNovoSku: boolean;
  precoVenda?: number | null;
  precoMinimo?: number | null;
  marca?: string | null;
  finalidade?: FinalidadeEntrada | null;
  /** CFOP de entrada informado manualmente (casos especiais fora da matriz). Sobrepõe o automático. */
  cfopEntrada?: string | null;
  /** Conversão de embalagem: unidades de venda por unidade de compra (1 CX = 12 UN ⇒ 12). */
  fatorConversao?: number | null;
  /** Unidade de venda alvo (ex.: UN) quando há conversão de embalagem. */
  unidadeVenda?: string | null;
};

type LoadedEntryItem = Prisma.EntradaFiscalItemGetPayload<{ include: { entradaFiscal: true; impostos: true } }>;

/**
 * Cache reutilizado ao gravar vínculos de VÁRIOS itens da mesma nota numa única transação:
 * a empresa (regime/UF) é uma só, as UFs de fornecedor se repetem, e os itens são pré-carregados
 * de uma vez. Evita N consultas idênticas dentro da transação — principal causa de lentidão/timeout
 * em notas com muitos itens.
 *
 * `impostoColeta` acumula os IDs dos impostos a marcar recuperável/não-recuperável; o chamador em
 * lote aplica tudo em apenas 2 updateMany no fim (em vez de 1 por imposto por item).
 */
type LinkBatchContext = {
  empresa?: { regimeTributario: RegimeTributario; enderecoUf: string | null } | null;
  fornecedorUfCache?: Map<string, string | null>;
  itemCache?: Map<string, LoadedEntryItem>;
  impostoColeta?: { recuperaveis: string[]; naoRecuperaveis: string[] };
};

/**
 * Aplica uma finalidade escolhida manualmente a um item: recalcula o CFOP de entrada e a flag
 * de estoque, e reavalia o crédito recuperável de cada imposto conforme o regime da empresa.
 * O eixo interno/interestadual é preservado do CFOP já derivado na importação. Um CFOP informado
 * manualmente (cfopOverride, 4 dígitos) tem prioridade sobre a derivação — cobre casos especiais
 * (devolução, remessa, importação) que não estão na matriz das 4 finalidades.
 */
async function applyFinalidadeManual(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  item: { id: string; cfopEntradaDerivado: string | null; fornecedorId: string | null; impostos: Array<{ id: string; tributo: TipoTributo; cst: string | null; csosn: string | null }> },
  finalidade: FinalidadeEntrada,
  cfopOverride?: string | null,
  ctx?: LinkBatchContext
) {
  // Empresa (regime/UF) e UF do fornecedor são iguais para todos os itens de uma mesma nota.
  // Em lote, vêm do cache (ctx) para não refazer N queries idênticas dentro da transação.
  const empresa = ctx?.empresa !== undefined
    ? ctx.empresa
    : await tx.empresa.findUnique({ where: { id: scope.empresaId }, select: { regimeTributario: true, enderecoUf: true } });
  const regime = empresa?.regimeTributario ?? "SIMPLES_NACIONAL";
  const empresaUf = empresa?.enderecoUf?.trim().toUpperCase() || null;

  // Eixo interno x interestadual pela UF do fornecedor vs empresa (robusto). Só cai no primeiro
  // dígito do CFOP anterior se as UFs não estiverem disponíveis.
  let fornecedorUf: string | null = null;
  if (item.fornecedorId) {
    if (ctx?.fornecedorUfCache?.has(item.fornecedorId)) {
      fornecedorUf = ctx.fornecedorUfCache.get(item.fornecedorId) ?? null;
    } else {
      const fornecedor = await tx.fornecedor.findUnique({ where: { id: item.fornecedorId }, select: { uf: true } });
      fornecedorUf = fornecedor?.uf?.trim().toUpperCase() || null;
      ctx?.fornecedorUfCache?.set(item.fornecedorId, fornecedorUf);
    }
  }
  const interestadual = empresaUf && fornecedorUf
    ? fornecedorUf !== empresaUf
    : (item.cfopEntradaDerivado ?? "").startsWith("2");

  const icms = item.impostos.find((imp) => imp.tributo === "ICMS");
  const st = isSubstituicaoTributaria({ cstIcms: icms?.cst ?? null, csosn: icms?.csosn ?? null });
  const cfopManual = (cfopOverride ?? "").replace(/\D/g, "");
  const cfopEntrada = cfopManual.length === 4 ? cfopManual : resolveCfopEntrada(finalidade, { interestadual, st });
  const movimentaEstoque = finalidade === "REVENDA" || finalidade === "INDUSTRIALIZACAO";

  await tx.entradaFiscalItem.update({
    where: { id: item.id },
    data: { finalidade, finalidadeOrigem: "MANUAL", cfopEntradaDerivado: cfopEntrada, movimentaEstoque }
  });

  for (const imp of item.impostos) {
    const recuperavel = creditoPorFinalidade(finalidade, regime, imp.tributo, { st }).recuperavel;
    if (ctx?.impostoColeta) {
      // Em lote: só acumula os IDs; o chamador grava tudo em 2 updateMany no fim.
      (recuperavel ? ctx.impostoColeta.recuperaveis : ctx.impostoColeta.naoRecuperaveis).push(imp.id);
    } else {
      await tx.entradaFiscalItemImposto.updateMany({
        where: { tenantId: scope.tenantId, empresaId: scope.empresaId, entradaFiscalItemId: item.id, tributo: imp.tributo },
        data: { recuperavel }
      });
    }
  }
}

async function updateFiscalEntryItemLinkInTransaction(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  itemId: string,
  input: FiscalEntryItemLinkInput,
  ctx?: LinkBatchContext
) {
    const item = ctx?.itemCache?.get(itemId) ?? await tx.entradaFiscalItem.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        id: itemId
      },
      include: {
        entradaFiscal: true,
        impostos: true
      }
    });

    if (!item) {
      throw new Error("Item da entrada fiscal não encontrado.");
    }

    if (item.entradaFiscal.status !== "AGUARDANDO_CONFERENCIA" && item.entradaFiscal.status !== "CONFERIDA") {
      throw new Error(
        "Esta entrada já processou estoque/financeiro e não permite alterar vínculo ou finalidade. " +
          "Para corrigir: ESTORNE a entrada (desfaz estoque e contas a pagar), exclua-a e importe o XML " +
          "novamente — aí ajuste a finalidade na conferência antes de processar."
      );
    }

    // Finalidade escolhida pelo usuário (quando enviada) recalcula CFOP/estoque/crédito.
    // Um CFOP informado manualmente sobrepõe o automático (casos especiais).
    if (input.finalidade) {
      await applyFinalidadeManual(tx, scope, { ...item, fornecedorId: item.entradaFiscal.fornecedorId }, input.finalidade, input.cfopEntrada, ctx);

      // Uso/consumo e imobilizado não viram SKU nem exigem preço: lançam apenas a obrigação
      // financeira. Se o usuário apontou um produto existente, mantém o vínculo (para histórico);
      // senão fica sem produto. Encerra aqui, ignorando a exigência de preço do "criar SKU".
      if (input.finalidade === "USO_CONSUMO" || input.finalidade === "IMOBILIZADO") {
        const produtoId = !input.criarNovoSku && input.produtoId ? input.produtoId : null;
        if (produtoId) {
          const produto = await tx.produto.findFirst({
            where: { tenantId: scope.tenantId, empresaId: scope.empresaId, id: produtoId, ativo: true },
            select: { id: true }
          });
          if (!produto) {
            throw new Error("Produto informado não pertence a esta empresa ou está inativo.");
          }
        }
        return tx.entradaFiscalItem.update({
          where: { id: item.id },
          data: {
            produtoId,
            precoVendaDefinido: null,
            precoMinimoDefinido: null,
            marcaDefinida: null,
            produtoVinculadoAutomaticamente: false,
            confiancaVinculo: produtoId ? 100 : 0,
            revisarVinculo: false
          }
        });
      }
    }

    // Conversão de embalagem (comprar em fardo/caixa, vender unitário): fator = unidades de venda por
    // unidade de compra. Persistido no item para o lançamento e o estorno espelharem a mesma conta.
    const fatorNorm = input.fatorConversao && input.fatorConversao > 0 ? input.fatorConversao : 1;
    const unidadeVendaNorm = fatorNorm > 1 ? (input.unidadeVenda?.trim() || "UN") : (input.unidadeVenda?.trim() || null);

    if (input.criarNovoSku) {
      if (!input.precoVenda || input.precoVenda <= 0) {
        throw new Error("Informe o preço de venda para criar um novo SKU.");
      }

      const updated = await tx.entradaFiscalItem.update({
        where: { id: item.id },
        data: {
          produtoId: null,
          precoVendaDefinido: input.precoVenda,
          precoMinimoDefinido: input.precoMinimo && input.precoMinimo > 0 ? input.precoMinimo : input.precoVenda,
          marcaDefinida: input.marca?.trim() || null,
          fatorConversao: fatorNorm,
          unidadeVenda: unidadeVendaNorm,
          produtoVinculadoAutomaticamente: false,
          confiancaVinculo: 0,
          revisarVinculo: false
        }
      });

      await createAuditLog(tx, {
        scope,
        entidade: "EntradaFiscalItem",
        entidadeId: item.id,
        acao: "CREATE_NEW_SKU_SELECTED",
        payload: { entradaFiscalId: item.entradaFiscalId, codigoFornecedor: item.codigoFornecedor }
      });

      return updated;
    }

    if (!input.produtoId) {
      throw new Error("Informe o produto do sistema para vincular.");
    }

    const product = await tx.produto.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        id: input.produtoId,
        ativo: true
      }
    });

    if (!product) {
      throw new Error("Produto informado não pertence a esta empresa ou está inativo.");
    }

    const updated = await tx.entradaFiscalItem.update({
      where: { id: item.id },
      data: {
        produtoId: product.id,
        precoVendaDefinido: null,
        precoMinimoDefinido: null,
        marcaDefinida: null,
        fatorConversao: fatorNorm,
        unidadeVenda: unidadeVendaNorm ?? product.unidade,
        produtoVinculadoAutomaticamente: false,
        confiancaVinculo: 100,
        revisarVinculo: false
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "EntradaFiscalItem",
      entidadeId: item.id,
      acao: "LINK_PRODUCT",
      payload: { entradaFiscalId: item.entradaFiscalId, produtoId: product.id, sku: product.sku }
    });

    return updated;
}

export async function updateFiscalEntryItemLink(
  scope: TenantScope,
  itemId: string,
  input: FiscalEntryItemLinkInput
) {
  return prisma.$transaction(async (tx) => updateFiscalEntryItemLinkInTransaction(tx, scope, itemId, input), FISCAL_TRANSACTION_OPTIONS);
}

export async function updateFiscalEntryItemLinks(
  scope: TenantScope,
  links: Array<FiscalEntryItemLinkInput & { itemId: string }>
) {
  return prisma.$transaction(async (tx) => {
    // Empresa (regime/UF) é uma só para toda a nota; UFs de fornecedor se repetem. Carrega uma
    // vez e reaproveita por item (evita N consultas idênticas dentro da transação).
    const empresa = await tx.empresa.findUnique({
      where: { id: scope.empresaId },
      select: { regimeTributario: true, enderecoUf: true }
    });

    // Pré-carrega TODOS os itens de uma vez (1 consulta em vez de N findFirst).
    const itens = await tx.entradaFiscalItem.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, id: { in: links.map((l) => l.itemId) } },
      include: { entradaFiscal: true, impostos: true }
    });
    const itemCache = new Map(itens.map((item) => [item.id, item]));

    const ctx: LinkBatchContext = {
      empresa,
      fornecedorUfCache: new Map(),
      itemCache,
      impostoColeta: { recuperaveis: [], naoRecuperaveis: [] }
    };

    const updated = [];
    for (const link of links) {
      updated.push(await updateFiscalEntryItemLinkInTransaction(tx, scope, link.itemId, link, ctx));
    }

    // Aplica o crédito recuperável de TODOS os impostos em apenas 2 consultas (em vez de 1 por
    // imposto por item: 150 → 2 numa nota de 50 itens).
    if (ctx.impostoColeta!.recuperaveis.length) {
      await tx.entradaFiscalItemImposto.updateMany({
        where: { id: { in: ctx.impostoColeta!.recuperaveis } },
        data: { recuperavel: true }
      });
    }
    if (ctx.impostoColeta!.naoRecuperaveis.length) {
      await tx.entradaFiscalItemImposto.updateMany({
        where: { id: { in: ctx.impostoColeta!.naoRecuperaveis } },
        data: { recuperavel: false }
      });
    }

    return { updated: updated.length };
  }, FISCAL_BATCH_TRANSACTION_OPTIONS);
}

function extractJsonArray(content: string) {
  const first = content.indexOf("[");
  const last = content.lastIndexOf("]");

  if (first < 0 || last < first) {
    throw new Error("A IA não retornou uma lista JSON válida.");
  }

  return JSON.parse(content.slice(first, last + 1)) as Array<{
    itemId: string;
    produtoId: string | null;
    confianca: number;
    motivo: string;
  }>;
}

export async function suggestFiscalEntryLinksWithAi(scope: TenantScope, entradaFiscalId: string) {
  const entrada = await prisma.entradaFiscal.findFirst({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      id: entradaFiscalId
    },
    include: {
      itens: true
    }
  });

  if (!entrada) {
    throw new Error("Entrada fiscal não encontrada.");
  }

  const products = await prisma.produto.findMany({
    where: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      ativo: true
    },
    orderBy: { sku: "asc" },
    select: {
      id: true,
      sku: true,
      nome: true,
      codigoOriginal: true,
      codigoFabricante: true,
      gtin: true,
      ncm: true,
      marca: { select: { nome: true } }
    },
    take: 200
  });

  const content = await callOpenRouter(scope, [
    {
      role: "system",
      content: [
        "Você ajuda um ERP brasileiro a vincular itens de NF-e de entrada aos produtos cadastrados.",
        "Responda somente com JSON válido, sem markdown.",
        "Use null quando não houver correspondência segura."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        instrucoes: "Para cada item, retorne itemId, produtoId, confianca de 0 a 100 e motivo curto.",
        itensNfe: entrada.itens.map((item) => ({
          itemId: item.id,
          codigoFornecedor: item.codigoFornecedor,
          descricao: item.descricaoFornecedor,
          gtin: item.gtin,
          ncm: item.ncm,
          unidade: item.unidade
        })),
        produtosSistema: products.map((product) => ({
          produtoId: product.id,
          sku: product.sku,
          nome: product.nome,
          codigoOriginal: product.codigoOriginal,
          codigoFabricante: product.codigoFabricante,
          gtin: product.gtin,
          ncm: product.ncm,
          marca: product.marca?.nome
        })),
        formato: [
          { itemId: "id-do-item", produtoId: "id-do-produto-ou-null", confianca: 95, motivo: "SKU e NCM compatíveis" }
        ]
      })
    }
  ], { maxTokens: 1200, temperature: 0 });

  const suggestions = extractJsonArray(content);

  return suggestions.map((suggestion) => ({
    itemId: String(suggestion.itemId),
    produtoId: suggestion.produtoId ? String(suggestion.produtoId) : null,
    confianca: Number(suggestion.confianca) || 0,
    motivo: String(suggestion.motivo || "")
  }));
}

function extractFinalidadeArray(content: string) {
  const first = content.indexOf("[");
  const last = content.lastIndexOf("]");

  if (first < 0 || last < first) {
    throw new Error("A IA não retornou uma lista JSON válida.");
  }

  return JSON.parse(content.slice(first, last + 1)) as Array<{
    itemId: string;
    finalidade: string;
    confianca: number;
    motivo: string;
  }>;
}

/**
 * Sugere a finalidade (revenda, uso/consumo, imobilizado, industrialização) de cada item da
 * entrada via IA, a partir da descrição/NCM/CFOP de origem. A escolha do usuário sempre prevalece;
 * estas sugestões são aplicadas no wizard apenas para conferência.
 */
export async function suggestFiscalEntryFinalidadesWithAi(scope: TenantScope, entradaFiscalId: string) {
  const entrada = await prisma.entradaFiscal.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, id: entradaFiscalId },
    include: { itens: true }
  });

  if (!entrada) {
    throw new Error("Entrada fiscal não encontrada.");
  }

  const content = await callOpenRouter(scope, [
    {
      role: "system",
      content: [
        "Você é um assistente fiscal brasileiro que classifica a FINALIDADE de itens recebidos em NF-e de entrada.",
        "As finalidades possíveis são exatamente: REVENDA (mercadoria para revender), USO_CONSUMO (material consumido na operação, como limpeza/escritório),",
        "IMOBILIZADO (bem do ativo: máquinas, móveis, veículos, equipamentos) e INDUSTRIALIZACAO (insumo/matéria-prima para produção).",
        "Responda somente com JSON válido, sem markdown."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        instrucoes: "Para cada item, retorne itemId, finalidade (um dos 4 valores), confianca de 0 a 100 e motivo curto.",
        itensNfe: entrada.itens.map((item) => ({
          itemId: item.id,
          descricao: item.descricaoFornecedor,
          ncm: item.ncm,
          cfopOrigem: item.cfop,
          unidade: item.unidade
        })),
        formato: [
          { itemId: "id-do-item", finalidade: "REVENDA", confianca: 90, motivo: "descrição compatível com revenda" }
        ]
      })
    }
  ], { maxTokens: 1200, temperature: 0 });

  const suggestions = extractFinalidadeArray(content);

  return suggestions
    .map((suggestion) => ({
      itemId: String(suggestion.itemId),
      finalidade: String(suggestion.finalidade || "").toUpperCase(),
      confianca: Number(suggestion.confianca) || 0,
      motivo: String(suggestion.motivo || "")
    }))
    .filter((suggestion) => isFinalidadeEntrada(suggestion.finalidade));
}

// =====================================================================================
// Lançamento MANUAL de nota de entrada (sem XML): o usuário digita cabeçalho, itens
// (com conversão de embalagem) e parcelas. Cria a entrada em AGUARDANDO_CONFERENCIA; o
// usuário revisa e processa pelo mesmo wizard/processFiscalEntry da entrada por XML.
// =====================================================================================

export type ManualFiscalEntryInput = {
  fornecedor: { id?: string | null; documento?: string | null; razaoSocial?: string | null; uf?: string | null };
  numero?: string | null;
  serie?: string | null;
  modelo?: string | null;
  chaveAcesso?: string | null;
  cfopPrincipal?: string | null;
  emitidaEm?: string | null;
  recebidaEm?: string | null;
  valorFrete?: number;
  valorSeguro?: number;
  valorDesconto?: number;
  outrasDespesas?: number;
  observacoes?: string | null;
  itens: Array<{
    codigoFornecedor: string;
    descricao: string;
    gtin?: string | null;
    ncm?: string | null;
    cest?: string | null;
    cfop?: string | null;
    unidade: string;
    quantidade: number;
    valorUnitario: number;
    valorDesconto?: number;
    fatorConversao?: number;
    unidadeVenda?: string | null;
    finalidade?: FinalidadeEntrada | null;
    produtoId?: string | null;
    criarNovoSku?: boolean;
    precoVenda?: number | null;
    precoMinimo?: number | null;
    marca?: string | null;
    impostos?: Array<{ tributo: TipoTributo; cst?: string | null; csosn?: string | null; base?: number; aliquota?: number; valor?: number }>;
  }>;
  parcelas?: Array<{ numero?: string | null; vencimento?: string | null; valor: number; formaPagamento?: string | null }>;
};

/** Dados para montar o formulário de lançamento manual (fornecedores + produtos para vínculo). */
export async function getManualFiscalEntryFormData(scope: TenantScope) {
  const [fornecedores, produtos] = await Promise.all([
    prisma.fornecedor.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true, uf: true }
    }),
    prisma.produto.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, sku: true, nome: true, unidade: true, unidadeCompra: true, fatorConversaoCompra: true, precoVenda: true, ultimoCusto: true }
    })
  ]);

  return {
    fornecedores: fornecedores.map((f) => ({
      id: f.id,
      documento: f.documento,
      uf: f.uf ?? "",
      label: f.nomeFantasia ? `${f.nomeFantasia} (${f.razaoSocial})` : f.razaoSocial
    })),
    produtos: produtos.map((p) => ({
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      unidade: p.unidade,
      unidadeCompra: p.unidadeCompra,
      fatorConversaoCompra: Number(p.fatorConversaoCompra ?? 1),
      precoVenda: Number(p.precoVenda ?? 0),
      ultimoCusto: Number(p.ultimoCusto ?? 0)
    }))
  };
}

export async function createManualFiscalEntry(scope: TenantScope, input: ManualFiscalEntryInput) {
  const itens = (input.itens ?? []).filter((item) => item.codigoFornecedor?.trim() && item.descricao?.trim());
  if (!itens.length) {
    throw new Error("Informe ao menos um item na nota de entrada.");
  }
  for (const item of itens) {
    if (!(item.quantidade > 0)) {
      throw new Error(`Quantidade inválida no item ${item.codigoFornecedor}.`);
    }
    if (item.valorUnitario < 0) {
      throw new Error(`Valor unitário inválido no item ${item.codigoFornecedor}.`);
    }
    const movimenta = (item.finalidade ?? "REVENDA") === "REVENDA" || (item.finalidade ?? "REVENDA") === "INDUSTRIALIZACAO";
    if (movimenta && !item.produtoId && (!item.precoVenda || item.precoVenda <= 0)) {
      throw new Error(`Informe o produto vinculado ou o preço de venda (novo SKU) do item ${item.codigoFornecedor}.`);
    }
  }

  return prisma.$transaction(async (tx) => {
    // Fornecedor: usa o existente (id) ou cria/atualiza pelo documento. Pode ficar sem fornecedor.
    let fornecedorId: string | null = null;
    let fornecedorUf: string | null = null;
    if (input.fornecedor?.id) {
      const forn = await tx.fornecedor.findFirst({
        where: { id: input.fornecedor.id, ...scopedByTenantCompany(scope) },
        select: { id: true, uf: true }
      });
      if (!forn) throw new Error("Fornecedor informado não pertence a esta empresa.");
      fornecedorId = forn.id;
      fornecedorUf = forn.uf?.trim().toUpperCase() || null;
    } else if (input.fornecedor?.documento?.trim()) {
      const forn = await resolveFornecedor(
        tx,
        scope,
        input.fornecedor.documento.trim(),
        input.fornecedor.razaoSocial?.trim() || input.fornecedor.documento.trim(),
        input.fornecedor.uf?.trim() || undefined
      );
      fornecedorId = forn?.id ?? null;
      fornecedorUf = forn?.uf?.trim().toUpperCase() || null;
    }

    const empresa = await tx.empresa.findUnique({
      where: { id: scope.empresaId },
      select: { enderecoUf: true, regimeTributario: true }
    });
    const empresaUf = empresa?.enderecoUf?.trim().toUpperCase() || null;
    const regime = empresa?.regimeTributario ?? "SIMPLES_NACIONAL";
    const interestadual = Boolean(empresaUf && fornecedorUf && empresaUf !== fornecedorUf);

    const frete = Number(input.valorFrete ?? 0);
    const seguro = Number(input.valorSeguro ?? 0);
    const descontoNota = Number(input.valorDesconto ?? 0);
    const outras = Number(input.outrasDespesas ?? 0);

    const itensCalc = itens.map((item, index) => {
      const desconto = Number(item.valorDesconto ?? 0);
      const valorTotal = Math.round((item.quantidade * item.valorUnitario - desconto + Number.EPSILON) * 100) / 100;
      return { ...item, itemNumero: index + 1, valorDescontoCalc: desconto, valorTotal: valorTotal < 0 ? 0 : valorTotal };
    });
    const totalProdutos = Math.round((itensCalc.reduce((s, i) => s + i.valorTotal, 0) + Number.EPSILON) * 100) / 100;
    const totalNota = Math.round((totalProdutos + frete + seguro + outras - descontoNota + Number.EPSILON) * 100) / 100;

    const entrada = await tx.entradaFiscal.create({
      data: {
        ...scopedByTenantCompanyAmbiente(scope),
        fornecedorId,
        chaveAcesso: input.chaveAcesso?.trim() || null,
        numero: input.numero?.trim() || null,
        serie: input.serie?.trim() || null,
        modelo: input.modelo?.trim() || "55",
        cfopPrincipal: input.cfopPrincipal?.trim() || itensCalc[0]?.cfop?.trim() || null,
        status: "AGUARDANDO_CONFERENCIA",
        emitidaEm: input.emitidaEm ? new Date(`${input.emitidaEm.slice(0, 10)}T12:00:00.000Z`) : new Date(),
        recebidaEm: input.recebidaEm ? new Date(`${input.recebidaEm.slice(0, 10)}T12:00:00.000Z`) : new Date(),
        totalProdutos,
        totalNota,
        valorFrete: frete,
        valorSeguro: seguro,
        valorDesconto: descontoNota,
        outrasDespesas: outras,
        observacoes: input.observacoes?.trim() || null
      }
    });

    for (const item of itensCalc) {
      const finalidade = item.finalidade ?? "REVENDA";
      const movimentaEstoque = finalidade === "REVENDA" || finalidade === "INDUSTRIALIZACAO";
      const icms = item.impostos?.find((imp) => imp.tributo === "ICMS");
      const st = isSubstituicaoTributaria({ cstIcms: icms?.cst ?? null, csosn: icms?.csosn ?? null }) || cfopIndicaSt(item.cfop ?? null);
      const cfopEntrada = resolveCfopEntrada(finalidade, { interestadual, st });
      const fatorNorm = item.fatorConversao && item.fatorConversao > 0 ? item.fatorConversao : 1;
      const unidadeVendaNorm = fatorNorm > 1 ? (item.unidadeVenda?.trim() || "UN") : (item.unidadeVenda?.trim() || null);

      // Vínculo: produto existente (produtoId) ou novo SKU (precoVendaDefinido). Uso/consumo e
      // imobilizado não exigem preço nem produto.
      let produtoId: string | null = null;
      if (item.produtoId && !item.criarNovoSku) {
        const produto = await tx.produto.findFirst({
          where: { id: item.produtoId, ...scopedByTenantCompany(scope), ativo: true },
          select: { id: true }
        });
        if (!produto) throw new Error(`Produto do item ${item.codigoFornecedor} não pertence a esta empresa.`);
        produtoId = produto.id;
      }

      const createdItem = await tx.entradaFiscalItem.create({
        data: {
          ...scopedByTenantCompany(scope),
          entradaFiscalId: entrada.id,
          produtoId,
          itemNumero: item.itemNumero,
          codigoFornecedor: item.codigoFornecedor.trim(),
          descricaoFornecedor: item.descricao.trim(),
          gtin: item.gtin?.trim() || null,
          ncm: item.ncm?.replace(/\D/g, "") || null,
          cest: item.cest?.replace(/\D/g, "") || null,
          cfop: item.cfop?.replace(/\D/g, "") || null,
          unidade: item.unidade?.trim() || "UN",
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          valorTotal: item.valorTotal,
          valorDesconto: item.valorDescontoCalc,
          fatorConversao: fatorNorm,
          unidadeVenda: unidadeVendaNorm,
          precoVendaDefinido: !produtoId && item.precoVenda ? item.precoVenda : null,
          precoMinimoDefinido: !produtoId ? (item.precoMinimo && item.precoMinimo > 0 ? item.precoMinimo : item.precoVenda ?? null) : null,
          marcaDefinida: !produtoId ? item.marca?.trim() || null : null,
          produtoVinculadoAutomaticamente: false,
          confiancaVinculo: produtoId ? 100 : 0,
          revisarVinculo: false,
          finalidade,
          finalidadeSugerida: finalidade,
          finalidadeOrigem: "MANUAL",
          cfopEntradaDerivado: cfopEntrada,
          movimentaEstoque
        }
      });

      const impostosValidos = (item.impostos ?? []).filter(
        (imp) => imp.cst || imp.csosn || (imp.base ?? 0) > 0 || (imp.aliquota ?? 0) > 0 || (imp.valor ?? 0) > 0
      );
      if (impostosValidos.length) {
        await tx.entradaFiscalItemImposto.createMany({
          data: impostosValidos.map((imp) => ({
            ...scopedByTenantCompany(scope),
            entradaFiscalItemId: createdItem.id,
            tributo: imp.tributo,
            cst: imp.cst?.trim() || null,
            csosn: imp.csosn?.trim() || null,
            baseCalculo: imp.base ?? null,
            aliquota: imp.aliquota ?? null,
            valor: imp.valor ?? null,
            recuperavel: creditoPorFinalidade(finalidade, regime, imp.tributo, { st }).recuperavel
          }))
        });
      }
    }

    // Parcelas: usa as informadas; senão cria uma única (vencimento +30 dias) para o usuário
    // ajustar na etapa financeira do wizard antes de processar.
    const parcelasInput = (input.parcelas ?? []).filter((p) => Number(p.valor) > 0);
    if (parcelasInput.length) {
      await tx.entradaFiscalParcela.createMany({
        data: parcelasInput.map((p, index) => ({
          ...scopedByTenantCompany(scope),
          entradaFiscalId: entrada.id,
          numero: p.numero?.trim() || String(index + 1),
          vencimento: p.vencimento ? new Date(`${p.vencimento.slice(0, 10)}T12:00:00.000Z`) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          valor: Number(p.valor),
          formaPagamento: p.formaPagamento?.trim() || "A definir",
          origem: "MANUAL"
        }))
      });
    } else {
      await tx.entradaFiscalParcela.create({
        data: {
          ...scopedByTenantCompany(scope),
          entradaFiscalId: entrada.id,
          numero: "1",
          vencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          valor: totalNota,
          formaPagamento: "A definir",
          origem: "MANUAL"
        }
      });
    }

    await createAuditLog(tx, {
      scope,
      entidade: "EntradaFiscal",
      entidadeId: entrada.id,
      acao: "CREATE_MANUAL",
      payload: { numero: entrada.numero, fornecedorId, itens: itensCalc.length, totalNota }
    });

    return { id: entrada.id };
  }, FISCAL_TRANSACTION_OPTIONS);
}
