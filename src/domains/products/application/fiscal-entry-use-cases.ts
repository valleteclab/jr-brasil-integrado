import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import { parseNfeXml } from "@/domains/products/xml/nfe-server-parser";
import type { ParsedNfeItem } from "@/domains/products/xml/nfe-server-parser";
import { callOpenRouter } from "@/domains/ai/openrouter-service";

const FISCAL_TRANSACTION_OPTIONS = {
  maxWait: 10000,
  timeout: 30000
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
    precoVendaDefinido: Prisma.Decimal | null;
    precoMinimoDefinido: Prisma.Decimal | null;
    marcaDefinida: string | null;
    confiancaVinculo: Prisma.Decimal | null;
    revisarVinculo: boolean;
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
        purchaseConversion: "1",
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
      salePrice: item.precoVendaDefinido ? String(Number(item.precoVendaDefinido)).replace(".", ",") : "",
      minimumPrice: item.precoMinimoDefinido ? String(Number(item.precoMinimoDefinido)).replace(".", ",") : "",
      brand: item.marcaDefinida ?? ""
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
  item: { ncm: string | null; cest: string | null }
) {
  if (!item.ncm) {
    return;
  }

  await tx.produtoFiscal.upsert({
    where: { produtoId },
    update: {
      ncm: item.ncm,
      cest: item.cest || null,
      regraTributariaId: undefined
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId,
      ncm: item.ncm,
      cest: item.cest || null
    }
  });
}

async function resolveFornecedor(tx: Prisma.TransactionClient, scope: TenantScope, document?: string, name?: string) {
  if (!document) {
    return null;
  }

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
      nomeFantasia: name || undefined
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      documento: document,
      razaoSocial: name || document,
      nomeFantasia: name || undefined
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
    const fornecedor = await resolveFornecedor(tx, scope, parsed.supplierDocument, parsed.supplierName);
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
        outrasDespesas: parsed.otherExpenses
      }
    });

    const responseItems = [];

    for (const item of parsed.items) {
      const match = await matchProduct(tx, scope, fornecedor?.id, item);
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
          produtoVinculadoAutomaticamente: Boolean(match.product),
          confiancaVinculo: match.confidence,
          revisarVinculo: match.review
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
          purchaseConversion: "1",
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
        review: match.review
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
      items: responseItems
    };
  }, FISCAL_TRANSACTION_OPTIONS);
}

export async function processFiscalEntry(
  scope: TenantScope,
  entradaFiscalId: string,
  input?: { installments?: FiscalEntryInstallmentInput[] }
) {
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
        itens: true
      }
    });

    if (!entrada) {
      throw new Error("Entrada fiscal não encontrada.");
    }

    if (entrada.status === "ESTOQUE_PROCESSADO") {
      throw new Error("Entrada fiscal já processada.");
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
    const categoria = await tx.produtoCategoria.upsert({
      where: {
        tenantId_empresaId_slug: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          slug: "importado-xml"
        }
      },
      update: { nome: "Importado XML" },
      create: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: "Importado XML",
        slug: "importado-xml"
      }
    });
    let created = 0;
    let updated = 0;

    for (const item of entrada.itens) {
      let produtoId = item.produtoId;

      if (!produtoId) {
        if (!item.precoVendaDefinido || Number(item.precoVendaDefinido) <= 0) {
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
            tipo: "PRODUTO",
            codigoOriginal: item.codigoFornecedor,
            gtin: item.gtin,
            categoriaId: categoria.id,
            marcaId: marca?.id,
            unidade: item.unidade,
            unidadeCompra: item.unidade,
            fatorConversaoCompra: 1,
            ncm: item.ncm,
            cest: item.cest,
            cfop: item.cfop,
            precoCusto: item.valorUnitario,
            ultimoCusto: item.valorUnitario,
            custoMedio: item.valorUnitario,
            precoVenda: item.precoVendaDefinido,
            precoMinimo: item.precoMinimoDefinido ?? item.precoVendaDefinido,
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

      const product = await tx.produto.findFirst({
        where: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          id: produtoId
        },
        select: {
          id: true,
          precoCusto: true,
          custoMedio: true
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
      const nextQuantity = previousQuantity + Number(item.quantidade);
      const previousAverageCost = Number(product.custoMedio ?? product.precoCusto ?? item.valorUnitario);
      const incomingQuantity = Number(item.quantidade);
      const incomingCost = Number(item.valorUnitario);
      const weightedAverageCost = nextQuantity > 0
        ? ((previousQuantity * previousAverageCost) + (incomingQuantity * incomingCost)) / nextQuantity
        : incomingCost;

      await tx.produto.update({
        where: { id: produtoId },
        data: {
          ultimoCusto: item.valorUnitario,
          precoCusto: item.valorUnitario,
          custoMedio: weightedAverageCost,
          ncm: item.ncm,
          cest: item.cest,
          cfop: item.cfop
        }
      });
      await upsertProductFiscalFromEntryItem(tx, scope, produtoId, item);

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
          quantidade: item.quantidade,
          saldoAntes: previousQuantity,
          saldoDepois: nextQuantity,
          custoUnitario: item.valorUnitario,
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
  }, FISCAL_TRANSACTION_OPTIONS);
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
        orderBy: { itemNumero: "asc" }
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
      const previousQuantity = Number(saldo?.quantidade ?? 0);
      const reversalQuantity = Number(item.quantidade);
      const nextQuantity = previousQuantity - reversalQuantity;

      if (nextQuantity < 0 && !item.produto.permiteEstoqueNegativo) {
        throw new Error(`Saldo insuficiente para estornar o SKU ${item.produto.sku}. Saldo atual: ${previousQuantity}.`);
      }

      const previousAverageCost = Number(item.produto.custoMedio ?? item.produto.precoCusto ?? item.valorUnitario);
      const itemCost = Number(item.valorUnitario);
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
          custoUnitario: item.valorUnitario,
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
          select: { id: true }
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
      payload: { numero: entrada.numero, status: entrada.status, itens: itemIds.length }
    });

    return { id: entrada.id };
  }, FISCAL_TRANSACTION_OPTIONS);
}

type FiscalEntryItemLinkInput = {
  produtoId?: string | null;
  criarNovoSku: boolean;
  precoVenda?: number | null;
  precoMinimo?: number | null;
  marca?: string | null;
};

async function updateFiscalEntryItemLinkInTransaction(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  itemId: string,
  input: FiscalEntryItemLinkInput
) {
    const item = await tx.entradaFiscalItem.findFirst({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        id: itemId
      },
      include: {
        entradaFiscal: true
      }
    });

    if (!item) {
      throw new Error("Item da entrada fiscal não encontrado.");
    }

    if (item.entradaFiscal.status !== "AGUARDANDO_CONFERENCIA" && item.entradaFiscal.status !== "CONFERIDA") {
      throw new Error("Esta entrada fiscal não permite alteração de vínculo.");
    }

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
    const updated = [];

    for (const link of links) {
      updated.push(await updateFiscalEntryItemLinkInTransaction(tx, scope, link.itemId, link));
    }

    return { updated: updated.length };
  }, FISCAL_TRANSACTION_OPTIONS);
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
