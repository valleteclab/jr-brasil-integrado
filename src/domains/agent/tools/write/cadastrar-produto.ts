import type { AgentTool } from "../../types";
import { prisma } from "@/lib/db/prisma";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { createProduct } from "@/domains/products/application/product-use-cases";

function optionalText(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const raw = String(value).trim();
  const normalized = typeof value === "number"
    ? value
    : Number(
        raw.includes(",")
          ? raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
          : raw.replace(/[^\d.-]/g, "")
      );
  return Number.isFinite(normalized) ? normalized : undefined;
}

export const cadastrarProduto: AgentTool = {
  name: "cadastrar_produto",
  description:
    "Cadastra um produto novo e fiscalmente utilizável no catálogo da empresa. Antes da confirmação, obtenha nome, preço, estoque inicial, unidade, NCM, origem e respostas explícitas para GTIN e CEST (aceite SEM GTIN/SEM CEST). Mostre o resumo e peça CADASTRAR. Só então chame com confirmar=true. SKU vazio é gerado automaticamente. Não invente classificação fiscal nem use para alterar produto existente.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome/descrição principal do produto." },
      sku: { type: "string", description: "SKU opcional; vazio gera PRD-NNNNNN automaticamente." },
      tipo: { type: "string", enum: ["PRODUTO", "KIT", "INSUMO"], description: "Padrão PRODUTO." },
      marca: { type: "string", description: "Marca; padrão Sem marca." },
      categoria: { type: "string", description: "Categoria; padrão Sem categoria." },
      gtin: { type: "string", description: "GTIN/EAN com 8, 12, 13 ou 14 dígitos; envie SEM GTIN quando não possuir." },
      unidade: { type: "string", description: "Unidade de venda, por exemplo UN, KG ou LT." },
      descricao: { type: "string", description: "Descrição curta opcional." },
      ncm: { type: "string", description: "NCM com exatamente 8 dígitos." },
      cest: { type: "string", description: "CEST com 7 dígitos; envie SEM CEST quando não se aplicar." },
      origem: { type: "string", enum: ["0", "1", "2", "3", "4", "5", "6", "7", "8"], description: "Código de origem fiscal da mercadoria, de 0 a 8." },
      cfopDentroEstado: { type: "string", description: "CFOP de venda dentro do estado (opcional)." },
      cfopForaEstado: { type: "string", description: "CFOP de venda fora do estado (opcional)." },
      precoCusto: { type: "number", description: "Preço de custo; padrão zero." },
      precoVenda: { type: "number", description: "Preço de venda à vista, obrigatório e não negativo." },
      precoVendaPrazo: { type: "number", description: "Preço de venda a prazo (opcional)." },
      precoMinimo: { type: "number", description: "Preço mínimo (opcional)." },
      estoqueInicial: { type: "number", description: "Quantidade inicial; padrão zero." },
      estoqueMinimo: { type: "number", description: "Estoque mínimo; padrão zero." },
      estoqueMaximo: { type: "number", description: "Estoque máximo; padrão zero." },
      deposito: { type: "string", description: "Nome do depósito; usa o estoque geral quando ausente." },
      visivelEcommerce: { type: "boolean", description: "Se aparece na loja; padrão true." },
      confirmar: { type: "boolean", description: "Obrigatório true somente após o gestor responder CADASTRAR." }
    },
    required: ["nome", "precoVenda", "estoqueInicial", "unidade", "ncm", "origem", "gtin", "cest", "confirmar"],
    additionalProperties: false
  },
  handler: async (scope, args) => {
    if (args.confirmar !== true) {
      return {
        ok: false,
        data: null,
        error: "Cadastro não confirmado. Mostre nome, SKU, preço, estoque, unidade e dados fiscais e peça o gestor responder CADASTRAR."
      };
    }

    const nome = optionalText(args.nome);
    const precoVenda = optionalNumber(args.precoVenda);
    const estoqueInicial = optionalNumber(args.estoqueInicial);
    const unidade = optionalText(args.unidade)?.toUpperCase();
    const ncm = optionalText(args.ncm)?.replace(/\D/g, "");
    const origem = optionalText(args.origem);
    const gtinInformado = optionalText(args.gtin);
    const cestInformado = optionalText(args.cest);
    if (!nome) return { ok: false, data: null, error: "Informe o nome do produto." };
    if (precoVenda === undefined || precoVenda < 0) {
      return { ok: false, data: null, error: "Informe um preço de venda válido e não negativo." };
    }
    if (estoqueInicial === undefined || estoqueInicial < 0) {
      return { ok: false, data: null, error: "Informe o estoque inicial, mesmo que seja zero." };
    }
    if (!unidade) return { ok: false, data: null, error: "Informe a unidade de venda, por exemplo UN, KG ou LT." };
    if (!ncm || ncm.length !== 8) return { ok: false, data: null, error: "Informe o NCM com exatamente 8 dígitos." };
    if (!origem || !/^[0-8]$/.test(origem)) {
      return { ok: false, data: null, error: "Informe o código de origem fiscal da mercadoria, de 0 a 8." };
    }
    if (!gtinInformado) return { ok: false, data: null, error: "Informe o GTIN ou responda SEM GTIN." };
    if (!cestInformado) return { ok: false, data: null, error: "Informe o CEST ou responda SEM CEST." };

    const semGtin = /^SEM\s+GTIN$/i.test(gtinInformado);
    const semCest = /^SEM\s+CEST$/i.test(cestInformado);
    const gtin = semGtin ? undefined : gtinInformado.replace(/\D/g, "");
    const cest = semCest ? undefined : cestInformado.replace(/\D/g, "");
    if (!semGtin && ![8, 12, 13, 14].includes(gtin?.length ?? 0)) {
      return { ok: false, data: null, error: "GTIN inválido. Informe 8, 12, 13 ou 14 dígitos, ou responda SEM GTIN." };
    }
    if (!semCest && (cest?.length ?? 0) !== 7) {
      return { ok: false, data: null, error: "CEST inválido. Informe 7 dígitos, ou responda SEM CEST." };
    }
    if (gtin) {
      const existente = await prisma.produto.findFirst({
        where: { ...scopedByTenantCompany(scope), gtin },
        select: { id: true, sku: true, nome: true, ativo: true }
      });
      if (existente) {
        return {
          ok: false,
          data: null,
          error: `O GTIN ${gtin} já pertence ao produto ${existente.sku} — ${existente.nome}${existente.ativo ? "" : " (arquivado)"}. Não foi criado outro cadastro.`
        };
      }
    }

    try {
      const produto = await createProduct(scope, {
        name: nome,
        sku: optionalText(args.sku),
        type: optionalText(args.tipo) ?? "PRODUTO",
        brand: optionalText(args.marca) ?? "Sem marca",
        category: optionalText(args.categoria) ?? "Sem categoria",
        barcode: gtin,
        unit: unidade,
        shortDescription: optionalText(args.descricao),
        ncm,
        cest,
        origin: origem,
        cfopInState: optionalText(args.cfopDentroEstado),
        cfopOutState: optionalText(args.cfopForaEstado),
        costValue: optionalNumber(args.precoCusto) ?? 0,
        priceValue: precoVenda,
        termPrice: optionalNumber(args.precoVendaPrazo) ?? 0,
        minimumPrice: optionalNumber(args.precoMinimo) ?? 0,
        availableStock: estoqueInicial,
        minimumStock: optionalNumber(args.estoqueMinimo) ?? 0,
        maxStock: optionalNumber(args.estoqueMaximo) ?? 0,
        warehouse: optionalText(args.deposito),
        ecommerceVisible: args.visivelEcommerce !== false
      });

      return {
        ok: true,
        data: {
          produtoId: produto.id,
          sku: produto.sku,
          nome: produto.nome,
          tipo: produto.tipo,
          unidade: produto.unidade,
          precoVenda: Number(produto.precoVenda),
          estoqueInicial,
          ncm: produto.ncm,
          origem: produto.origem,
          gtin: produto.gtin ?? "SEM GTIN",
          cest: produto.cest ?? "SEM CEST",
          cadastroUrl: "/erp/produtos",
          prontoParaEmissaoFiscal: true
        }
      };
    } catch (error) {
      return {
        ok: false,
        data: null,
        error: error instanceof Error ? error.message : "Falha ao cadastrar o produto."
      };
    }
  }
};
