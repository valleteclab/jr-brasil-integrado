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
  // Fiscal básico
  ncm?: string;
  cest?: string;
  origin?: string;
  cfopInState?: string;
  cfopOutState?: string;
  taxRuleId?: string;
  taxRuleName?: string;
  // ICMS
  icmsCst?: string;
  icmsCsosn?: string;
  icmsRate?: string;
  icmsReducaoBC?: string;
  // ICMS-ST
  icmsSTMVA?: string;
  icmsSTAliquota?: string;
  // FCP
  fcpAliquota?: string;
  fcpSTAliquota?: string;
  // IPI
  ipiCst?: string;
  ipiCodEnq?: string;
  ipiRate?: string;
  // PIS
  pisCst?: string;
  pisRate?: string;
  // COFINS
  cofinsCst?: string;
  cofinsRate?: string;
  // Preços e estoque
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
        }
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

      const fiscal = product.fiscal;

      function decRate(value: unknown) {
        const n = Number(value);
        return n ? String(n).replace(".", ",") : "";
      }

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
        ncm: product.ncm ?? fiscal?.ncm ?? "",
        cest: product.cest ?? fiscal?.cest ?? "",
        origin: product.origem ?? fiscal?.origem ?? "",
        cfopInState: product.cfop ?? "",
        cfopOutState: "",
        taxRuleId: fiscal?.regraTributariaId ?? "",
        taxRuleName: fiscal?.regraTributaria?.nome ?? "",
        // ICMS
        icmsCst: fiscal?.icmsCST ?? "",
        icmsCsosn: fiscal?.icmsCSOSN ?? "",
        icmsRate: decRate(fiscal?.icmsAliquota),
        icmsReducaoBC: decRate(fiscal?.icmsReducaoBC),
        // ICMS-ST
        icmsSTMVA: decRate(fiscal?.icmsSTMVA),
        icmsSTAliquota: decRate(fiscal?.icmsSTAliquota),
        // FCP
        fcpAliquota: decRate(fiscal?.fcpAliquota),
        fcpSTAliquota: decRate(fiscal?.fcpSTAliquota),
        // IPI
        ipiCst: fiscal?.ipiCST ?? "",
        ipiCodEnq: fiscal?.ipiCodEnq ?? "",
        ipiRate: decRate(fiscal?.ipiAliquota),
        // PIS
        pisCst: fiscal?.pisCST ?? "",
        pisRate: decRate(fiscal?.pisAliquota),
        // COFINS
        cofinsCst: fiscal?.cofinsCST ?? "",
        cofinsRate: decRate(fiscal?.cofinsAliquota),
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
        storeDescription: product.descricaoComercial ?? ""
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
