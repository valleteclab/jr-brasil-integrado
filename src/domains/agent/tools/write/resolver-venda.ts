import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";

/**
 * Resolve referências "humanas" de venda no SERVIDOR — cliente por nome/CNPJ e produto por SKU —
 * para que criar_pre_venda/criar_orcamento fechem em UMA chamada de tool (o modelo não precisa
 * encadear consultar_cliente/buscar_produto só para descobrir ids internos). Ambiguidade volta
 * como erro claro com candidatos, para o modelo perguntar ou escolher.
 */

export type ClienteRef = { clienteId?: string | null; clienteBusca?: string | null };
export type ItemRef = { produtoId?: string; sku?: string; quantidade: number; precoUnitario?: number };

export async function resolverCliente(
  scope: TenantScope,
  ref: ClienteRef
): Promise<{ id: string | null; erro?: undefined } | { id?: undefined; erro: string }> {
  const id = ref.clienteId?.trim();
  if (id) {
    const cliente = await prisma.cliente.findFirst({ where: { id, ...scopedByTenantCompany(scope) }, select: { id: true } });
    if (cliente) return { id: cliente.id };
    return { erro: `clienteId "${id}" não existe nesta empresa. Informe clienteBusca (nome ou CNPJ/CPF) que eu localizo.` };
  }
  const busca = ref.clienteBusca?.trim();
  if (!busca) return { id: null }; // consumidor anônimo (permitido na pré-venda)

  const digitos = busca.replace(/\D/g, "");
  const porDocumento = digitos.length >= 8
    ? await prisma.cliente.findMany({ where: { ...scopedByTenantCompany(scope), documento: { contains: digitos } }, select: { id: true, razaoSocial: true, nomeFantasia: true }, take: 4 })
    : [];
  const candidatos = porDocumento.length
    ? porDocumento
    : await prisma.cliente.findMany({
        where: {
          ...scopedByTenantCompany(scope),
          OR: [
            { razaoSocial: { contains: busca, mode: "insensitive" } },
            { nomeFantasia: { contains: busca, mode: "insensitive" } }
          ]
        },
        select: { id: true, razaoSocial: true, nomeFantasia: true },
        take: 4
      });

  if (candidatos.length === 1) return { id: candidatos[0].id };
  if (candidatos.length === 0) return { erro: `Nenhum cliente encontrado para "${busca}". Confirme o nome/CNPJ ou cadastre o cliente.` };
  return {
    erro: `Mais de um cliente para "${busca}": ${candidatos.map((c) => `${c.nomeFantasia ?? c.razaoSocial} (id ${c.id})`).join(" | ")}. Pergunte ao usuário qual é e chame de novo com o clienteId.`
  };
}

export type ProdutoResolvido = { id: string; sku: string; nome: string; precoVenda: unknown };

/**
 * Localiza um produto por código em CAMADAS: SKU exato → código do fabricante/original/GTIN →
 * FUZZY por tokens (ex.: "boleto-teste" acha "TESTE-BOLETO"). Ambíguo devolve os candidatos.
 * Tolerante de propósito: no chat o usuário digita o código de memória, com hífens/ordem trocada.
 */
export async function localizarProduto(
  scope: TenantScope,
  codigo: string
): Promise<{ produto: ProdutoResolvido; erro?: undefined } | { produto?: undefined; erro: string }> {
  const base = scopedByTenantCompany(scope);
  const sel = { id: true, sku: true, nome: true, precoVenda: true };
  const termo = codigo.trim();

  // 1) SKU exato (case-insensitive).
  let p = await prisma.produto.findFirst({ where: { ...base, sku: { equals: termo, mode: "insensitive" } }, select: sel });
  if (p) return { produto: p };

  // 2) Código do fabricante / código original / GTIN exatos.
  const digitos = termo.replace(/\D/g, "");
  p = await prisma.produto.findFirst({
    where: {
      ...base,
      OR: [
        { codigoFabricante: { equals: termo, mode: "insensitive" } },
        { codigoOriginal: { equals: termo, mode: "insensitive" } },
        ...(digitos.length >= 8 ? [{ gtin: digitos }] : [])
      ]
    },
    select: sel
  });
  if (p) return { produto: p };

  // 3) Fuzzy por tokens: todos os tokens do código precisam aparecer no SKU ou no nome.
  const tokens = termo.split(/[^a-zA-Z0-9]+/).filter((t) => t.length >= 2);
  if (tokens.length) {
    const candidatos = await prisma.produto.findMany({
      where: {
        ...base,
        AND: tokens.map((t) => ({
          OR: [
            { sku: { contains: t, mode: "insensitive" as const } },
            { nome: { contains: t, mode: "insensitive" as const } },
            { codigoFabricante: { contains: t, mode: "insensitive" as const } }
          ]
        }))
      },
      select: sel,
      take: 4
    });
    if (candidatos.length === 1) return { produto: candidatos[0] };
    if (candidatos.length > 1) {
      return { erro: `Mais de um produto para "${termo}": ${candidatos.map((c) => `${c.sku} (${c.nome})`).join(" | ")}. Pergunte ao usuário qual é e use o SKU exato.` };
    }
  }
  return { erro: `Produto "${termo}" não encontrado. Use buscar_produto para localizar pelo nome.` };
}

export async function resolverItens(
  scope: TenantScope,
  itens: ItemRef[]
): Promise<{ itens: Array<{ produtoId: string; quantidade: number; precoUnitario: number }>; erro?: undefined } | { itens?: undefined; erro: string }> {
  const resolvidos: Array<{ produtoId: string; quantidade: number; precoUnitario: number }> = [];
  for (const item of itens) {
    const quantidade = Number(item.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) return { erro: "Quantidade inválida em um dos itens." };

    let produto: { id: string; precoVenda: unknown } | null = null;
    if (item.produtoId?.trim()) {
      produto = await prisma.produto.findFirst({
        where: { id: item.produtoId.trim(), ...scopedByTenantCompany(scope) },
        select: { id: true, precoVenda: true }
      });
      // produtoId desconhecido pode ser um SKU no campo errado — tenta como código antes de falhar.
      if (!produto) {
        const porCodigo = await localizarProduto(scope, item.produtoId);
        if (porCodigo.erro) return { erro: `produtoId "${item.produtoId}" não existe nesta empresa. ${porCodigo.erro}` };
        produto = porCodigo.produto ?? null;
      }
    } else if (item.sku?.trim()) {
      const achado = await localizarProduto(scope, item.sku);
      if (achado.erro) return { erro: achado.erro };
      produto = achado.produto ?? null;
    } else {
      return { erro: "Cada item precisa de produtoId ou sku." };
    }
    if (!produto) return { erro: `Não consegui localizar o produto do item (${item.sku ?? item.produtoId}).` };

    const precoInformado = Number(item.precoUnitario);
    const precoCadastro = Number(produto.precoVenda);
    const precoUnitario = Number.isFinite(precoInformado) && precoInformado > 0 ? precoInformado : precoCadastro;
    if (!Number.isFinite(precoUnitario) || precoUnitario <= 0) {
      return { erro: `O produto ${item.sku ?? item.produtoId} está sem preço de venda no cadastro — informe precoUnitario.` };
    }
    resolvidos.push({ produtoId: produto.id, quantidade, precoUnitario });
  }
  return { itens: resolvidos };
}
