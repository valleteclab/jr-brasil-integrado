import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type QuoteSummary = {
  id: string;
  numero: string;
  cliente: string;
  clienteId: string;
  canal: string;
  status: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "info" | "mute" | "violet";
  total: string;
  subtotal: string;
  desconto: string;
  vendedor: string;
  condicaoPagamento: string;
  validoAte: string | null;
  aprovadoEm: string | null;
  pedidoGeradoId: string | null;
  criadoEm: string;
  canAprovar: boolean;
  canRejeitar: boolean;
  canConverter: boolean;
};

export type QuoteDetail = QuoteSummary & {
  observacaoVendedor: string | null;
  itens: Array<{
    id: string;
    produtoId: string;
    produtoNome: string;
    produtoSku: string;
    quantidade: number;
    precoUnitario: string;
    total: string;
  }>;
};

export type QuoteFormData = {
  clientes: Array<{ id: string; label: string }>;
  produtos: Array<{ id: string; sku: string; nome: string; preco: number }>;
};

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_ANALISE: "Em análise",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  APROVADO: "Aprovado",
  EXPIRADO: "Expirado",
  REJEITADO: "Rejeitado",
  CONVERTIDO: "Convertido em pedido",
};

const STATUS_TONES: Record<string, "success" | "warn" | "danger" | "info" | "mute" | "violet"> = {
  RASCUNHO: "mute",
  EM_ANALISE: "info",
  AGUARDANDO_CLIENTE: "warn",
  APROVADO: "success",
  EXPIRADO: "danger",
  REJEITADO: "danger",
  CONVERTIDO: "violet",
};

function mapQuote(orc: {
  id: string;
  numero: string;
  clienteId: string;
  canal: string;
  cliente: { razaoSocial: string; nomeFantasia?: string | null };
  status: string;
  total: { toString(): string };
  subtotal: { toString(): string };
  desconto: { toString(): string };
  vendedor: string | null;
  condicaoPagamento: string | null;
  validoAte: Date | null;
  aprovadoEm: Date | null;
  pedidoGeradoId: string | null;
  criadoEm: Date;
}): QuoteSummary {
  return {
    id: orc.id,
    numero: orc.numero,
    cliente: orc.cliente.nomeFantasia ?? orc.cliente.razaoSocial,
    clienteId: orc.clienteId,
    canal: orc.canal,
    status: orc.status,
    statusLabel: STATUS_LABELS[orc.status] ?? orc.status,
    statusTone: STATUS_TONES[orc.status] ?? "mute",
    total: formatBrl(Number(orc.total)),
    subtotal: formatBrl(Number(orc.subtotal)),
    desconto: formatBrl(Number(orc.desconto)),
    vendedor: orc.vendedor ?? "",
    condicaoPagamento: orc.condicaoPagamento ?? "",
    validoAte: orc.validoAte ? orc.validoAte.toLocaleDateString("pt-BR") : null,
    aprovadoEm: orc.aprovadoEm ? orc.aprovadoEm.toLocaleDateString("pt-BR") : null,
    pedidoGeradoId: orc.pedidoGeradoId,
    criadoEm: orc.criadoEm.toLocaleDateString("pt-BR"),
    canAprovar: ["RASCUNHO", "EM_ANALISE", "AGUARDANDO_CLIENTE"].includes(orc.status),
    canRejeitar: !["CONVERTIDO", "REJEITADO"].includes(orc.status),
    canConverter: orc.status === "APROVADO" && !orc.pedidoGeradoId,
  };
}

export async function listQuotes(): Promise<QuoteSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }
  try {
    const scope = await getDevelopmentTenantScope();
    const orcamentos = await prisma.orcamento.findMany({
      where: scopedByTenantCompany(scope),
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true } },
      },
      orderBy: { criadoEm: "desc" },
    });
    return orcamentos.map(mapQuote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar orçamentos: ${message}`);
  }
}

export async function getQuoteDetail(id: string): Promise<QuoteDetail | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }
  try {
    const scope = await getDevelopmentTenantScope();
    const orc = await prisma.orcamento.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true } },
        itens: {
          include: {
            produto: { select: { nome: true, sku: true } },
          },
        },
      },
    });
    if (!orc) return null;

    return {
      ...mapQuote(orc),
      observacaoVendedor: orc.observacaoVendedor,
      itens: orc.itens.map((item) => ({
        id: item.id,
        produtoId: item.produtoId,
        produtoNome: item.produto.nome,
        produtoSku: item.produto.sku,
        quantidade: item.quantidade,
        precoUnitario: formatBrl(Number(item.precoUnitario)),
        total: formatBrl(Number(item.total)),
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar orçamento: ${message}`);
  }
}

export async function listQuoteFormData(): Promise<QuoteFormData> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }
  try {
    const scope = await getDevelopmentTenantScope();
    const [clientes, produtos] = await Promise.all([
      prisma.cliente.findMany({
        where: { ...scopedByTenantCompany(scope), status: "ATIVO" },
        select: { id: true, razaoSocial: true, nomeFantasia: true },
        orderBy: { razaoSocial: "asc" },
      }),
      prisma.produto.findMany({
        where: { ...scopedByTenantCompany(scope), ativo: true },
        select: { id: true, sku: true, nome: true, precoVenda: true },
        orderBy: { nome: "asc" },
      }),
    ]);

    return {
      clientes: clientes.map((c) => ({
        id: c.id,
        label: c.nomeFantasia ?? c.razaoSocial,
      })),
      produtos: produtos.map((p) => ({
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        preco: Number(p.precoVenda),
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar dados para o formulário: ${message}`);
  }
}
