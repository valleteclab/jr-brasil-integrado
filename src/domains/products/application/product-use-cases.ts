import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createAuditLog } from "@/lib/audit/audit-service";
import type { ProductPayload, ValidatedProductInput } from "./product-dto";
import { validateProductPayload } from "./product-dto";

// Banco remoto (Railway) tem latência: o cadastro faz várias queries em transação (produto,
// ficha fiscal, estoque inicial, aplicações, imagem, auditoria) e estoura o timeout padrão de 5s.
const TX_OPTIONS = { maxWait: 15000, timeout: 30000 };

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function resolveProductRelations(tx: Prisma.TransactionClient, scope: TenantScope, input: ValidatedProductInput) {
  const categorySlug = slugify(input.category) || "sem-categoria";

  const [categoria, marca, deposito] = await Promise.all([
    tx.produtoCategoria.upsert({
      where: {
        tenantId_empresaId_slug: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          slug: categorySlug
        }
      },
      update: { nome: input.category },
      create: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: input.category,
        slug: categorySlug
      }
    }),
    tx.produtoMarca.upsert({
      where: {
        tenantId_empresaId_nome: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          nome: input.brand
        }
      },
      update: {},
      create: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: input.brand
      }
    }),
    tx.deposito.upsert({
      where: {
        tenantId_empresaId_nome: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          nome: input.warehouse
        }
      },
      update: {},
      create: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        nome: input.warehouse,
        uf: "BA"
      }
    })
  ]);

  return { categoria, marca, deposito };
}

function productData(input: ValidatedProductInput, categoriaId: string, marcaId: string) {
  return {
    sku: input.sku,
    nome: input.name,
    descricao: input.technicalDescription || input.shortDescription || null,
    descricaoComercial: input.storeDescription || null,
    tipo: input.type,
    codigoOriginal: input.originalCode || null,
    codigoFabricante: input.manufacturerCode || null,
    gtin: input.barcode || null,
    categoriaId,
    marcaId,
    unidade: input.unit,
    unidadeCompra: input.purchaseUnit,
    fatorConversaoCompra: input.purchaseConversion,
    ncm: input.ncm || null,
    cest: input.cest || null,
    cfop: input.cfopOutState || input.cfopInState || null,
    origem: input.origin || null,
    precoCusto: input.costValue,
    ultimoCusto: input.lastCost,
    custoMedio: input.costValue,
    precoVenda: input.salePrice,
    precoMinimo: input.minimumPrice,
    permiteEstoqueNegativo: input.allowNegativeStock,
    permiteVendaSobEncomenda: input.allowBackorder,
    ativoCompra: true,
    ativoVenda: true,
    ativo: true,
    visivelEcommerce: input.ecommerceVisible
  };
}

async function upsertProductFiscal(tx: Prisma.TransactionClient, scope: TenantScope, productId: string, input: ValidatedProductInput) {
  if (!input.ncm) {
    await tx.produtoFiscal.deleteMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId: productId
      }
    });
    return;
  }

  if (input.taxRuleId) {
    const taxRule = await tx.regraTributaria.findFirst({
      where: {
        id: input.taxRuleId,
        tenantId: scope.tenantId,
        OR: [
          { empresaId: scope.empresaId },
          { empresaId: null }
        ],
        ativo: true
      },
      select: { id: true }
    });

    if (!taxRule) {
      throw new Error("Regra tributária não encontrada para esta empresa.");
    }
  }

  await tx.produtoFiscal.upsert({
    where: { produtoId: productId },
    update: {
      ncm: input.ncm,
      cest: input.cest || null,
      origem: input.origin || null,
      regraTributariaId: input.taxRuleId || null
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId: productId,
      ncm: input.ncm,
      cest: input.cest || null,
      origem: input.origin || null,
      regraTributariaId: input.taxRuleId || null
    }
  });
}

async function upsertInitialStock(tx: Prisma.TransactionClient, scope: TenantScope, productId: string, depositoId: string, input: ValidatedProductInput) {
  const previous = await tx.estoqueSaldo.findUnique({
    where: {
      tenantId_empresaId_produtoId_depositoId_controleKey: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId: productId,
        depositoId,
        controleKey: "SEM_CONTROLE"
      }
    }
  });
  const previousQuantity = Number(previous?.quantidade ?? 0);

  const saldo = await tx.estoqueSaldo.upsert({
    where: {
      tenantId_empresaId_produtoId_depositoId_controleKey: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId: productId,
        depositoId,
        controleKey: "SEM_CONTROLE"
      }
    },
    update: {
      quantidade: input.availableStock,
      minimo: input.minimumStock,
      maximo: input.maxStock
    },
    create: {
      tenantId: scope.tenantId,
      empresaId: scope.empresaId,
      produtoId: productId,
      depositoId,
      controleKey: "SEM_CONTROLE",
      quantidade: input.availableStock,
      minimo: input.minimumStock,
      maximo: input.maxStock
    }
  });

  if (previousQuantity !== input.availableStock) {
    await tx.estoqueMovimento.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId: productId,
        depositoId,
        tipo: "AJUSTE",
        quantidade: input.availableStock - previousQuantity,
        saldoAntes: previousQuantity,
        saldoDepois: input.availableStock,
        custoUnitario: input.costValue,
        custoTotal: input.costValue * Math.abs(input.availableStock - previousQuantity),
        documentoTipo: "PRODUTO_CADASTRO",
        documentoId: productId,
        idempotencyKey: `produto-cadastro:${productId}:${Date.now()}`,
        observacoes: previous ? "Ajuste manual pelo cadastro de produto." : "Saldo inicial informado no cadastro de produto."
      }
    });
  }

  return saldo;
}

/**
 * Substitui as aplicações veiculares do produto (que veículo a peça serve). Estratégia
 * delete-all + create-all, igual ao padrão das demais relações filhas. Vazio limpa todas.
 */
async function replaceProductAplicacoes(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  productId: string,
  aplicacoes: ValidatedProductInput["aplicacoes"]
) {
  await tx.produtoAplicacao.deleteMany({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, produtoId: productId }
  });
  if (aplicacoes.length) {
    await tx.produtoAplicacao.createMany({
      data: aplicacoes.map((a) => ({
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produtoId: productId,
        marca: a.marca,
        modelo: a.modelo,
        anoFaixa: a.anoFaixa,
        observacoes: a.observacoes
      }))
    });
  }
}

// Garante a imagem principal do produto (ex.: vinda do catálogo Cosmos) sem duplicar nem apagar
// as imagens já existentes da galeria. Se a URL já está cadastrada, não faz nada.
async function ensureProductImagem(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  productId: string,
  imageUrl?: string
) {
  const url = imageUrl?.trim();
  if (!url) return;
  const existe = await tx.produtoImagem.findFirst({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, produtoId: productId, url }
  });
  if (existe) return;
  const total = await tx.produtoImagem.count({
    where: { tenantId: scope.tenantId, empresaId: scope.empresaId, produtoId: productId }
  });
  await tx.produtoImagem.create({
    data: { tenantId: scope.tenantId, empresaId: scope.empresaId, produtoId: productId, url, ordem: total }
  });
}

export async function createProduct(scope: TenantScope, payload: ProductPayload) {
  const input = validateProductPayload(payload);

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.produto.findUnique({
      where: {
        tenantId_empresaId_sku: {
          tenantId: scope.tenantId,
          empresaId: scope.empresaId,
          sku: input.sku
        }
      }
    });

    if (duplicate) {
      throw new Error("Já existe um produto com este SKU.");
    }

    const { categoria, marca, deposito } = await resolveProductRelations(tx, scope, input);
    const product = await tx.produto.create({
      data: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        ...productData(input, categoria.id, marca.id)
      }
    });

    await upsertProductFiscal(tx, scope, product.id, input);
    await upsertInitialStock(tx, scope, product.id, deposito.id, input);
    await replaceProductAplicacoes(tx, scope, product.id, input.aplicacoes);
    await ensureProductImagem(tx, scope, product.id, input.imageUrl);
    await createAuditLog(tx, {
      scope,
      entidade: "Produto",
      entidadeId: product.id,
      acao: "CREATE",
      payload: { sku: product.sku, nome: product.nome }
    });

    return product;
  }, TX_OPTIONS);
}

export async function updateProduct(scope: TenantScope, productId: string, payload: ProductPayload) {
  const input = validateProductPayload(payload);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.produto.findFirst({
      where: {
        id: productId,
        ...scopedByTenantCompany(scope)
      }
    });

    if (!existing) {
      throw new Error("Produto não encontrado.");
    }

    const duplicate = await tx.produto.findFirst({
      where: {
        ...scopedByTenantCompany(scope),
        sku: input.sku,
        NOT: { id: productId }
      }
    });

    if (duplicate) {
      throw new Error("Já existe outro produto com este SKU.");
    }

    const { categoria, marca, deposito } = await resolveProductRelations(tx, scope, input);
    const product = await tx.produto.update({
      where: { id: productId },
      data: productData(input, categoria.id, marca.id)
    });

    await upsertProductFiscal(tx, scope, product.id, input);
    await upsertInitialStock(tx, scope, product.id, deposito.id, input);
    await replaceProductAplicacoes(tx, scope, product.id, input.aplicacoes);
    await ensureProductImagem(tx, scope, product.id, input.imageUrl);
    await createAuditLog(tx, {
      scope,
      entidade: "Produto",
      entidadeId: product.id,
      acao: "UPDATE",
      payload: {
        antes: { sku: existing.sku, nome: existing.nome },
        depois: { sku: product.sku, nome: product.nome }
      }
    });

    return product;
  }, TX_OPTIONS);
}

export async function archiveOrDeleteProduct(scope: TenantScope, productId: string) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.produto.findFirst({
      where: {
        id: productId,
        ...scopedByTenantCompany(scope)
      }
    });

    if (!product) {
      throw new Error("Produto não encontrado.");
    }

    await tx.produto.update({
      where: { id: product.id },
      data: {
        ativo: false,
        ativoCompra: false,
        ativoVenda: false,
        visivelEcommerce: false
      }
    });

    await createAuditLog(tx, {
      scope,
      entidade: "Produto",
      entidadeId: product.id,
      acao: "ARCHIVE",
      payload: { sku: product.sku, nome: product.nome }
    });

    return { id: product.id, archived: true };
  }, TX_OPTIONS);
}
