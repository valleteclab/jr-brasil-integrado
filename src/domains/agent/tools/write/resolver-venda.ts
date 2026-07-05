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
      if (!produto) return { erro: `produtoId "${item.produtoId}" não existe nesta empresa. Informe o sku que eu localizo.` };
    } else if (item.sku?.trim()) {
      const sku = item.sku.trim();
      produto = await prisma.produto.findFirst({
        where: { sku: { equals: sku, mode: "insensitive" }, ...scopedByTenantCompany(scope) },
        select: { id: true, precoVenda: true }
      });
      if (!produto) return { erro: `Produto com SKU "${sku}" não encontrado. Use buscar_produto para localizar pelo nome.` };
    } else {
      return { erro: "Cada item precisa de produtoId ou sku." };
    }

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
