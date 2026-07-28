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
    "Cadastra um produto novo no catálogo da empresa. AÇÃO DE ESCRITA: primeiro obtenha ao menos nome e preço de venda, pergunte estoque inicial se não foi informado, mostre um resumo com nome, SKU (ou automático), preço, estoque, unidade e dados fiscais e peça o usuário responder CADASTRAR. Só então chame com confirmar=true. O SKU pode ficar vazio para geração automática. Não use para alterar produto existente.",
  mode: "write",
  roles: ["GESTOR"],
  inputSchema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome/descrição principal do produto." },
      sku: { type: "string", description: "SKU opcional; vazio gera PRD-NNNNNN automaticamente." },
      tipo: { type: "string", enum: ["PRODUTO", "SERVICO", "KIT", "INSUMO"], description: "Padrão PRODUTO." },
      marca: { type: "string", description: "Marca; padrão Sem marca." },
      categoria: { type: "string", description: "Categoria; padrão Sem categoria." },
      gtin: { type: "string", description: "Código de barras GTIN/EAN com 8, 12, 13 ou 14 dígitos." },
      unidade: { type: "string", description: "Unidade de venda, por exemplo UN, KG, LT; padrão UN." },
      descricao: { type: "string", description: "Descrição curta opcional." },
      ncm: { type: "string", description: "NCM com 8 dígitos (opcional)." },
      cest: { type: "string", description: "CEST com 7 dígitos (opcional)." },
      origem: { type: "string", description: "Origem fiscal da mercadoria (opcional)." },
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
    required: ["nome", "precoVenda", "confirmar"],
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
    if (!nome) return { ok: false, data: null, error: "Informe o nome do produto." };
    if (precoVenda === undefined || precoVenda < 0) {
      return { ok: false, data: null, error: "Informe um preço de venda válido e não negativo." };
    }

    const gtin = optionalText(args.gtin)?.replace(/\D/g, "");
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
        unit: optionalText(args.unidade) ?? "UN",
        shortDescription: optionalText(args.descricao),
        ncm: optionalText(args.ncm),
        cest: optionalText(args.cest),
        origin: optionalText(args.origem),
        cfopInState: optionalText(args.cfopDentroEstado),
        cfopOutState: optionalText(args.cfopForaEstado),
        costValue: optionalNumber(args.precoCusto) ?? 0,
        priceValue: precoVenda,
        termPrice: optionalNumber(args.precoVendaPrazo) ?? 0,
        minimumPrice: optionalNumber(args.precoMinimo) ?? 0,
        availableStock: optionalNumber(args.estoqueInicial) ?? 0,
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
          estoqueInicial: optionalNumber(args.estoqueInicial) ?? 0,
          ncm: produto.ncm,
          cadastroUrl: "/erp/produtos",
          avisoFiscal: produto.ncm ? null : "Produto criado sem NCM; complete a classificação fiscal antes de emitir nota."
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
