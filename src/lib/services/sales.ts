import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";
import type { StatusPedido } from "@prisma/client";

export type SaleSummary = {
  id: string;
  numero: string;
  clienteNome: string;
  canal: string;
  status: StatusPedido;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "info" | "violet" | "mute";
  total: string;
  totalNumber: number;
  itensCount: number;
  criadoEm: string;
  confirmadoEm: string | null;
  faturadoEm: string | null;
  canceladoEm: string | null;
  canConfirm: boolean;
  canInvoice: boolean;
  canCancel: boolean;
  temNotaAutorizada: boolean;
};

export type SaleDetail = SaleSummary & {
  clienteId: string;
  clienteDocumento: string | null;
  depositoId: string | null;
  canal: string;
  subtotal: number;
  desconto: number;
  frete: number;
  condicaoPagamento: string | null;
  formaPagamento: string | null;
  observacoes: string | null;
  itens: Array<{
    id: string;
    produtoId: string;
    produtoNome: string;
    produtoSku: string;
    quantidade: number;
    precoUnitario: number;
    custoUnitario: number;
    desconto: number;
    total: number;
  }>;
  notas: Array<{
    id: string;
    numero: string | null;
    modelo: string;
    status: string;
    total: number;
    emitidaEm: string | null;
  }>;
};

export type SaleFormData = {
  clientes: Array<{ id: string; label: string; documento: string | null }>;
  produtos: Array<{ id: string; sku: string; nome: string; gtin: string | null; codigoOriginal: string | null; codigoFabricante: string | null; preco: number; disponivel: number }>;
};

function statusLabel(status: StatusPedido): string {
  const map: Record<StatusPedido, string> = {
    RASCUNHO: "Rascunho",
    AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
    AGUARDANDO_NOTA: "Aguardando nota",
    SEPARACAO: "Em separação",
    ENVIADO: "Faturado/Enviado",
    ENTREGUE: "Entregue",
    CANCELADO: "Cancelado"
  };
  return map[status] ?? status;
}

function statusTone(status: StatusPedido): SaleSummary["statusTone"] {
  const map: Record<StatusPedido, SaleSummary["statusTone"]> = {
    RASCUNHO: "mute",
    AGUARDANDO_PAGAMENTO: "warn",
    AGUARDANDO_NOTA: "info",
    SEPARACAO: "violet",
    ENVIADO: "success",
    ENTREGUE: "success",
    CANCELADO: "danger"
  };
  return map[status] ?? "mute";
}

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toLocaleDateString("pt-BR");
}

export async function listSales(): Promise<SaleSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados para listar vendas.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const pedidos = await prisma.pedidoVenda.findMany({
      where: scopedByTenantCompany(scope),
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true } },
        itens: { select: { id: true } },
        notasFiscais: { where: { status: "AUTORIZADA" }, select: { id: true } }
      },
      orderBy: { criadoEm: "desc" }
    });

    return pedidos.map((p) => {
      const temNota = p.notasFiscais.length > 0;
      return {
        id: p.id,
        numero: p.numero,
        clienteNome: p.cliente ? (p.cliente.nomeFantasia ?? p.cliente.razaoSocial) : "Consumidor não identificado",
        canal: p.canal,
        status: p.status,
        statusLabel: statusLabel(p.status),
        statusTone: statusTone(p.status),
        total: formatBrl(Number(p.total)),
        totalNumber: Number(p.total),
        itensCount: p.itens.length,
        criadoEm: formatDate(p.criadoEm) ?? "",
        confirmadoEm: formatDate(p.confirmadoEm),
        faturadoEm: formatDate(p.faturadoEm),
        canceladoEm: formatDate(p.canceladoEm),
        canConfirm: p.status === "RASCUNHO" || p.status === "AGUARDANDO_PAGAMENTO",
        canInvoice: p.status === "AGUARDANDO_NOTA",
        canCancel: p.status !== "CANCELADO" && !temNota,
        temNotaAutorizada: temNota
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível conectar ao banco para listar vendas: ${message}`);
  }
}

export async function getSaleDetail(id: string): Promise<SaleDetail | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const p = await prisma.pedidoVenda.findFirst({
      where: { id, ...scopedByTenantCompany(scope) },
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true, documento: true } },
        itens: {
          include: {
            produto: { select: { nome: true, sku: true } }
          }
        },
        notasFiscais: {
          select: { id: true, numero: true, modelo: true, status: true, total: true, emitidaEm: true }
        }
      }
    });

    if (!p) return null;

    const temNota = p.notasFiscais.some((n) => n.status === "AUTORIZADA");

    return {
      id: p.id,
      numero: p.numero,
      clienteId: p.clienteId ?? "",
      clienteNome: p.cliente ? (p.cliente.nomeFantasia ?? p.cliente.razaoSocial) : "Consumidor não identificado",
      clienteDocumento: p.cliente?.documento ?? "",
      status: p.status,
      statusLabel: statusLabel(p.status),
      statusTone: statusTone(p.status),
      total: formatBrl(Number(p.total)),
      totalNumber: Number(p.total),
      subtotal: Number(p.subtotal),
      desconto: Number(p.desconto),
      frete: Number(p.frete),
      canal: p.canal,
      depositoId: p.depositoId,
      condicaoPagamento: p.condicaoPagamento,
      formaPagamento: p.formaPagamento,
      observacoes: p.observacoes,
      itensCount: p.itens.length,
      criadoEm: formatDate(p.criadoEm) ?? "",
      confirmadoEm: formatDate(p.confirmadoEm),
      faturadoEm: formatDate(p.faturadoEm),
      canceladoEm: formatDate(p.canceladoEm),
      canConfirm: p.status === "RASCUNHO" || p.status === "AGUARDANDO_PAGAMENTO",
      canInvoice: p.status === "AGUARDANDO_NOTA",
      canCancel: p.status !== "CANCELADO" && !temNota,
      temNotaAutorizada: temNota,
      itens: p.itens.map((item) => ({
        id: item.id,
        produtoId: item.produtoId,
        produtoNome: item.produto.nome,
        produtoSku: item.produto.sku,
        quantidade: item.quantidade,
        precoUnitario: Number(item.precoUnitario),
        custoUnitario: Number(item.custoUnitario),
        desconto: Number(item.desconto),
        total: Number(item.total)
      })),
      notas: p.notasFiscais.map((n) => ({
        id: n.id,
        numero: n.numero,
        modelo: n.modelo,
        status: n.status,
        total: Number(n.total),
        emitidaEm: formatDate(n.emitidaEm)
      }))
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar detalhe da venda: ${message}`);
  }
}

export async function listSaleFormData(): Promise<SaleFormData> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Configure o banco de dados.");
  }

  try {
    const scope = await getDevelopmentTenantScope();

    const [clientes, produtos] = await Promise.all([
      prisma.cliente.findMany({
        where: { ...scopedByTenantCompany(scope), status: "ATIVO" },
        select: { id: true, razaoSocial: true, nomeFantasia: true, documento: true },
        orderBy: { razaoSocial: "asc" }
      }),
      prisma.produto.findMany({
        where: { ...scopedByTenantCompany(scope), ativo: true },
        select: {
          id: true,
          sku: true,
          nome: true,
          gtin: true,
          codigoOriginal: true,
          codigoFabricante: true,
          precoVenda: true,
          saldosEstoque: {
            select: { quantidade: true, reservado: true }
          }
        },
        orderBy: { nome: "asc" }
      })
    ]);

    return {
      clientes: clientes.map((c) => ({
        id: c.id,
        label: c.nomeFantasia ? `${c.nomeFantasia} (${c.razaoSocial})` : c.razaoSocial,
        documento: c.documento
      })),
      produtos: produtos.map((p) => {
        const disponivel = p.saldosEstoque.reduce(
          (sum, s) => sum + Math.max(Number(s.quantidade) - Number(s.reservado), 0),
          0
        );
        return {
          id: p.id,
          sku: p.sku,
          nome: p.nome,
          gtin: p.gtin,
          codigoOriginal: p.codigoOriginal,
          codigoFabricante: p.codigoFabricante,
          preco: Number(p.precoVenda),
          disponivel
        };
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar dados do formulário de venda: ${message}`);
  }
}
