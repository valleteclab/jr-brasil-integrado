/**
 * Solicitações vindas da LOJA VIRTUAL (vitrine pública). O cliente monta o carrinho, faz um
 * cadastro rápido e envia um PEDIDO ou um ORÇAMENTO. Aqui fazemos o upsert do Cliente (por
 * documento) e criamos PedidoVenda (canal "LOJA", sem reservar estoque, a aprovar pelo lojista)
 * ou Orcamento (canal "LOJA"). A conclusão da venda (pagamento, nota, entrega) acontece no ERP.
 */
import { prisma } from "@/lib/db/prisma";
import type { TenantScope } from "@/lib/auth/dev-session";
import { scopedByTenantCompany } from "@/lib/auth/dev-session";
import { isValidDocumento, normalizeDocumento } from "@/lib/fiscal/documento";
import { createSale } from "@/domains/sales/application/sale-use-cases";
import { createQuote } from "@/domains/sales-quote/application/quote-use-cases";

export class SolicitacaoLojaError extends Error {}

export type SolicitacaoLojaInput = {
  tipo: "PEDIDO" | "ORCAMENTO";
  cliente: {
    nome: string;
    documento: string;
    email?: string;
    telefone?: string;
    whatsapp?: string;
    endereco?: {
      cep?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
    };
  };
  itens: Array<{ produtoId: string; quantidade: number; precoUnitario: number }>;
  observacoes?: string;
};

async function upsertClienteLoja(scope: TenantScope, input: SolicitacaoLojaInput["cliente"]): Promise<string> {
  const nome = input.nome?.trim();
  if (!nome) throw new SolicitacaoLojaError("Informe seu nome.");
  const documento = normalizeDocumento(input.documento ?? "");
  if (!isValidDocumento(documento)) {
    throw new SolicitacaoLojaError("CPF/CNPJ inválido. Confira o número informado.");
  }

  const existente = await prisma.cliente.findUnique({
    where: { tenantId_documento: { tenantId: scope.tenantId, documento } },
    select: { id: true }
  });
  if (existente) return existente.id;

  const end = input.endereco;
  const temEndereco = Boolean(end?.cep || end?.logradouro || end?.cidade);

  const cliente = await prisma.cliente.create({
    data: {
      ...scopedByTenantCompany(scope),
      razaoSocial: nome,
      documento,
      status: "PENDENTE_APROVACAO",
      contatos: {
        create: [{
          ...scopedByTenantCompany(scope),
          nome,
          email: input.email?.trim() || null,
          telefone: input.telefone?.trim() || null,
          whatsapp: input.whatsapp?.trim() || input.telefone?.trim() || null,
          principal: true
        }]
      },
      ...(temEndereco
        ? {
            enderecos: {
              create: [{
                ...scopedByTenantCompany(scope),
                apelido: "Principal",
                cep: end?.cep?.trim() || "",
                logradouro: end?.logradouro?.trim() || "",
                numero: end?.numero?.trim() || null,
                complemento: end?.complemento?.trim() || null,
                bairro: end?.bairro?.trim() || null,
                cidade: end?.cidade?.trim() || "",
                uf: (end?.uf?.trim() || "").toUpperCase(),
                padrao: true
              }]
            }
          }
        : {})
    },
    select: { id: true }
  });
  return cliente.id;
}

export async function criarSolicitacaoLoja(scope: TenantScope, input: SolicitacaoLojaInput) {
  if (!input.itens?.length) throw new SolicitacaoLojaError("Carrinho vazio.");

  const clienteId = await upsertClienteLoja(scope, input.cliente);
  const itens = input.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario }));

  if (input.tipo === "ORCAMENTO") {
    const orc = await createQuote(scope, {
      clienteId,
      canal: "LOJA",
      itens,
      observacaoVendedor: input.observacoes?.trim() || undefined
    });
    return { tipo: "ORCAMENTO" as const, id: orc.id, numero: orc.numero };
  }

  const pedido = await createSale(scope, {
    clienteId,
    canal: "LOJA",
    statusInicial: "RASCUNHO",
    reservarEstoque: false,
    observacoes: input.observacoes?.trim() || undefined,
    itens
  });
  return { tipo: "PEDIDO" as const, id: pedido.id, numero: pedido.numero };
}
