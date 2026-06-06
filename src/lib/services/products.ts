import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type StorefrontProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: string;
  stockLabel: string;
  imageUrl?: string;
  description?: string;
};

export type ErpProductSummary = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: string;
  availableStock: number;
  minimumStock: number;
  status: "Em estoque" | "Crítico" | "Zerado";
  ecommerceVisible: boolean;
  originalCode?: string;
  barcode?: string;
  unit?: string;
  type?: string;
  shortDescription?: string;
  technicalDescription?: string;
  ncm?: string;
  cest?: string;
  origin?: string;
  cfopInState?: string;
  cfopOutState?: string;
  taxRuleId?: string;
  taxRuleName?: string;
  costValue?: string;
  lastCost?: string;
  averageCost?: string;
  minimumPrice?: string;
  warehouse?: string;
  reservedStock?: string;
  maxStock?: string;
  allowNegativeStock?: boolean;
  allowBackorder?: boolean;
  supplier?: string;
  supplierCode?: string;
  purchaseUnit?: string;
  purchaseConversion?: string;
  storeTitle?: string;
  storeDescription?: string;
  /** Aplicação veicular (autopeças): em quais veículos a peça serve. */
  aplicacoes?: Array<{ marca: string; modelo: string; anoFaixa: string; observacoes: string }>;
};

export type ProductTaxRuleOption = {
  id: string;
  name: string;
  operation: string;
  tax: string;
  scope: string;
  ncm: string;
  cfop: string;
  cst: string;
  csosn: string;
};

function getStockStatus(availableStock: number, minimumStock: number): ErpProductSummary["status"] {
  if (availableStock <= 0) {
    return "Zerado";
  }

  if (minimumStock > 0 && availableStock <= minimumStock) {
    return "Crítico";
  }

  return "Em estoque";
}

export async function listStorefrontCategories(): Promise<string[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const categorias = await prisma.produtoCategoria.findMany({
      where: {
        ...scopedByTenantCompany(scope),
        produtos: {
          some: { ativo: true, visivelEcommerce: true }
        }
      },
      orderBy: { nome: "asc" },
      select: { nome: true }
    });

    return categorias.map((categoria) => categoria.nome);
  } catch {
    return [];
  }
}

export async function listStorefrontProducts(): Promise<StorefrontProduct[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar produtos.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const products = await prisma.produto.findMany({
      where: {
        ...scopedByTenantCompany(scope),
        ativo: true,
        visivelEcommerce: true
      },
      include: {
        categoria: true,
        imagens: {
          orderBy: { ordem: "asc" },
          take: 1
        },
        marca: true,
        saldosEstoque: {
          include: {
            deposito: true
          }
        },
        fornecedores: {
          include: {
            fornecedor: true
          },
          orderBy: [
            { principal: "desc" },
            { atualizadoEm: "desc" }
          ],
          take: 1
        },
        fiscal: {
          include: {
            regraTributaria: true
          }
        }
      },
      orderBy: [{ criadoEm: "asc" }, { nome: "asc" }]
    });

    return products.map((product) => {
      const availableStock = product.saldosEstoque.reduce(
        (total, balance) => total + Math.max(Number(balance.quantidade) - Number(balance.reservado), 0),
        0
      );

      return {
        id: product.id,
        sku: product.sku,
        name: product.nome,
        brand: product.marca?.nome ?? "JR Brasil",
        category: product.categoria.nome,
        price: formatBrl(Number(product.precoVenda)),
        stockLabel: `${availableStock} un.`,
        imageUrl: product.imagens[0]?.url,
        description: product.descricaoComercial ?? product.descricao ?? undefined
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível conectar ao banco para listar produtos da loja: ${message}`);
  }
}

export type ProductPickerOption = { id: string; sku: string; name: string };

/**
 * Lista enxuta de produtos (id/sku/nome) para seletores e matching — sem os
 * includes pesados (saldos, aplicações, fornecedores, fiscal) do summary
 * completo. Usado no wizard de entrada de NF-e, que só precisa identificar o
 * produto a vincular. Reduz muito o tempo de carga da tela de lançamento.
 */
export async function listProductPickerOptions(): Promise<ProductPickerOption[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar produtos.");
  }

  const scope = await getDevelopmentTenantScope();
  const products = await prisma.produto.findMany({
    where: {
      ...scopedByTenantCompany(scope),
      ativo: true
    },
    select: { id: true, sku: true, nome: true },
    orderBy: [{ criadoEm: "asc" }, { nome: "asc" }]
  });

  return products.map((product) => ({ id: product.id, sku: product.sku, name: product.nome }));
}

export async function listErpProductSummaries(): Promise<ErpProductSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar produtos.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const products = await prisma.produto.findMany({
      where: {
        ...scopedByTenantCompany(scope),
        ativo: true
      },
      include: {
        categoria: true,
        marca: true,
        saldosEstoque: {
          include: {
            deposito: true
          }
        },
        fornecedores: {
          include: {
            fornecedor: true
          },
          orderBy: [
            { principal: "desc" },
            { atualizadoEm: "desc" }
          ],
          take: 1
        },
        fiscal: {
          include: {
            regraTributaria: true
          }
        },
        aplicacoes: true
      },
      orderBy: [{ criadoEm: "asc" }, { nome: "asc" }]
    });

    return products.map((product) => {
      const availableStock = product.saldosEstoque.reduce(
        (total, balance) => total + Math.max(Number(balance.quantidade) - Number(balance.reservado), 0),
        0
      );
      const minimumStock = product.saldosEstoque.reduce((total, balance) => total + Number(balance.minimo), 0);
      const maxStock = product.saldosEstoque.reduce((total, balance) => total + Number(balance.maximo), 0);
      const reservedStock = product.saldosEstoque.reduce((total, balance) => total + Number(balance.reservado), 0);
      const mainBalance = product.saldosEstoque[0];
      const supplierLink = product.fornecedores[0];

      return {
        id: product.id,
        sku: product.sku,
        name: product.nome,
        brand: product.marca?.nome ?? "",
        category: product.categoria.nome,
        price: formatBrl(Number(product.precoVenda)),
        availableStock,
        minimumStock,
        status: getStockStatus(availableStock, minimumStock),
        ecommerceVisible: product.visivelEcommerce,
        originalCode: product.codigoOriginal ?? "",
        barcode: product.gtin ?? "",
        unit: product.unidade,
        type: product.tipo,
        shortDescription: product.descricaoComercial ?? product.nome,
        technicalDescription: product.descricao ?? "",
        ncm: product.ncm ?? "",
        cest: product.cest ?? "",
        origin: product.origem ?? "",
        cfopInState: product.cfop ?? "",
        cfopOutState: "",
        taxRuleId: product.fiscal?.regraTributariaId ?? "",
        taxRuleName: product.fiscal?.regraTributaria?.nome ?? "",
        costValue: formatBrl(Number(product.custoMedio)),
        averageCost: formatBrl(Number(product.custoMedio)),
        lastCost: formatBrl(Number(product.ultimoCusto)),
        minimumPrice: formatBrl(Number(product.precoMinimo)),
        warehouse: mainBalance?.deposito.nome ?? "",
        reservedStock: String(reservedStock),
        maxStock: String(maxStock),
        allowNegativeStock: product.permiteEstoqueNegativo,
        allowBackorder: product.permiteVendaSobEncomenda,
        supplier: supplierLink?.fornecedor.razaoSocial ?? "",
        supplierCode: supplierLink?.codigoFornecedor ?? product.codigoOriginal ?? product.sku,
        purchaseUnit: product.unidadeCompra,
        purchaseConversion: String(Number(product.fatorConversaoCompra)),
        storeTitle: product.nome,
        storeDescription: product.descricaoComercial ?? "",
        aplicacoes: product.aplicacoes.map((a) => ({
          marca: a.marca ?? "",
          modelo: a.modelo ?? "",
          anoFaixa: a.anoFaixa ?? "",
          observacoes: a.observacoes ?? ""
        }))
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível conectar ao banco para listar produtos do ERP: ${message}`);
  }
}

export async function listProductTaxRuleOptions(): Promise<ProductTaxRuleOption[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar regras tributárias.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const rules = await prisma.regraTributaria.findMany({
      where: {
        tenantId: scope.tenantId,
        OR: [
          { empresaId: scope.empresaId },
          { empresaId: null }
        ],
        ativo: true
      },
      orderBy: [
        { nome: "asc" },
        { tributo: "asc" }
      ]
    });

    return rules.map((rule) => ({
      id: rule.id,
      name: rule.nome,
      operation: rule.operacao,
      tax: rule.tributo,
      scope: rule.empresaId ? "Empresa" : "Global",
      ncm: rule.ncm ?? "",
      cfop: rule.cfop ?? "",
      cst: rule.cst ?? "",
      csosn: rule.csosn ?? ""
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível conectar ao banco para listar regras tributárias: ${message}`);
  }
}
