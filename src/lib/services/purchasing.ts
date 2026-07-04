import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

export type SupplierSummary = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string;
  documento: string;
  inscricaoEstadual: string;
  email: string;
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  condicaoPagamento: string;
  observacoes: string;
  ativo: boolean;
  label: string;
};

export type PurchaseOrderSummary = {
  id: string;
  numero: string;
  fornecedor: string;
  fornecedorId: string;
  status: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "info" | "mute";
  total: string;
  subtotal: string;
  frete: string;
  percentRecebido: number;
  condicaoPagamento: string;
  observacoes: string;
  previsaoEm: string | null;
  criadoEm: string;
  canEnviar: boolean;
  canReceber: boolean;
  canCancelar: boolean;
};

export type PurchaseOrderDetail = PurchaseOrderSummary & {
  depositoId: string | null;
  itens: Array<{
    id: string;
    produtoId: string;
    produtoNome: string;
    produtoSku: string;
    quantidade: number;
    quantidadeRecebida: number;
    custoUnitario: string;
    total: string;
    percentRecebido: number;
    fatorConversao: number;
    unidade: string;
    unidadeCompra: string | null;
  }>;
};

export type PurchaseFormData = {
  fornecedores: Array<{ id: string; label: string }>;
  produtos: Array<{ id: string; sku: string; nome: string; ultimoCusto: number; unidade: string; unidadeCompra: string; fatorConversaoCompra: number }>;
};

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  PARCIAL: "Parcialmente recebido",
  RECEBIDO: "Recebido",
  CANCELADO: "Cancelado"
};

const STATUS_TONES: Record<string, "success" | "warn" | "danger" | "info" | "mute"> = {
  RASCUNHO: "mute",
  ENVIADO: "info",
  PARCIAL: "warn",
  RECEBIDO: "success",
  CANCELADO: "danger"
};

function mapPurchaseOrder(pedido: {
  id: string;
  numero: string;
  status: string;
  subtotal: { toString(): string };
  frete: { toString(): string };
  total: { toString(): string };
  condicaoPagamento: string | null;
  observacoes: string | null;
  previsaoEm: Date | null;
  criadoEm: Date;
  fornecedor: { razaoSocial: string; id: string };
  itens: Array<{ quantidade: number; quantidadeRecebida: { toString(): string } }>;
}): PurchaseOrderSummary {
  const totalQty = pedido.itens.reduce((sum, i) => sum + i.quantidade, 0);
  const receivedQty = pedido.itens.reduce((sum, i) => sum + Number(i.quantidadeRecebida), 0);
  const percentRecebido = totalQty > 0 ? Math.round((receivedQty / totalQty) * 100) : 0;

  return {
    id: pedido.id,
    numero: pedido.numero,
    fornecedor: pedido.fornecedor.razaoSocial,
    fornecedorId: pedido.fornecedor.id,
    status: pedido.status,
    statusLabel: STATUS_LABELS[pedido.status] ?? pedido.status,
    statusTone: STATUS_TONES[pedido.status] ?? "mute",
    total: formatBrl(Number(pedido.total)),
    subtotal: formatBrl(Number(pedido.subtotal)),
    frete: formatBrl(Number(pedido.frete)),
    percentRecebido,
    condicaoPagamento: pedido.condicaoPagamento ?? "",
    observacoes: pedido.observacoes ?? "",
    previsaoEm: pedido.previsaoEm
      ? new Intl.DateTimeFormat("pt-BR").format(pedido.previsaoEm)
      : null,
    criadoEm: new Intl.DateTimeFormat("pt-BR").format(pedido.criadoEm),
    canEnviar: pedido.status === "RASCUNHO",
    canReceber: pedido.status === "ENVIADO" || pedido.status === "PARCIAL",
    canCancelar: pedido.status === "RASCUNHO" || pedido.status === "ENVIADO"
  };
}

export async function listSuppliers(): Promise<SupplierSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();
  const fornecedores = await prisma.fornecedor.findMany({
    where: scopedByTenantCompany(scope),
    orderBy: [{ ativo: "desc" }, { razaoSocial: "asc" }]
  });

  return fornecedores.map((f) => ({
    id: f.id,
    razaoSocial: f.razaoSocial,
    nomeFantasia: f.nomeFantasia ?? "",
    documento: f.documento,
    inscricaoEstadual: f.inscricaoEstadual ?? "",
    email: f.email ?? "",
    telefone: f.telefone ?? "",
    cep: f.cep ?? "",
    logradouro: f.logradouro ?? "",
    numero: f.numero ?? "",
    complemento: f.complemento ?? "",
    bairro: f.bairro ?? "",
    cidade: f.cidade ?? "",
    uf: f.uf ?? "",
    condicaoPagamento: f.condicaoPagamento ?? "",
    observacoes: f.observacoes ?? "",
    ativo: f.ativo,
    label: f.nomeFantasia ? `${f.nomeFantasia} (${f.razaoSocial})` : f.razaoSocial
  }));
}

export async function listPurchaseOrders(): Promise<PurchaseOrderSummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();
  const pedidos = await prisma.pedidoCompra.findMany({
    where: scopedByTenantCompany(scope),
    include: {
      fornecedor: { select: { id: true, razaoSocial: true } },
      itens: { select: { quantidade: true, quantidadeRecebida: true } }
    },
    orderBy: { criadoEm: "desc" }
  });

  return pedidos.map(mapPurchaseOrder);
}

export async function getPurchaseOrderDetail(id: string): Promise<PurchaseOrderDetail | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();
  const pedido = await prisma.pedidoCompra.findFirst({
    where: { id, ...scopedByTenantCompany(scope) },
    include: {
      fornecedor: { select: { id: true, razaoSocial: true } },
      itens: {
        include: {
          produto: { select: { id: true, sku: true, nome: true, unidade: true } }
        }
      }
    }
  });

  if (!pedido) return null;

  const summary = mapPurchaseOrder({
    ...pedido,
    itens: pedido.itens.map((i) => ({ quantidade: i.quantidade, quantidadeRecebida: i.quantidadeRecebida }))
  });

  return {
    ...summary,
    depositoId: pedido.depositoId,
    itens: pedido.itens.map((item) => {
      const pctRec = item.quantidade > 0
        ? Math.round((Number(item.quantidadeRecebida) / item.quantidade) * 100)
        : 0;
      return {
        id: item.id,
        produtoId: item.produtoId,
        produtoNome: item.produto.nome,
        produtoSku: item.produto.sku,
        quantidade: item.quantidade,
        quantidadeRecebida: Number(item.quantidadeRecebida),
        custoUnitario: formatBrl(Number(item.custoUnitario)),
        total: formatBrl(Number(item.total)),
        percentRecebido: pctRec,
        fatorConversao: Number(item.fatorConversao ?? 1),
        unidade: item.produto.unidade,
        unidadeCompra: item.unidadeCompra ?? null
      };
    })
  };
}

export async function listPurchaseFormData(): Promise<PurchaseFormData> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const scope = await getDevelopmentTenantScope();

  const [fornecedores, produtos] = await Promise.all([
    prisma.fornecedor.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      orderBy: { razaoSocial: "asc" },
      select: { id: true, razaoSocial: true, nomeFantasia: true }
    }),
    prisma.produto.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, sku: true, nome: true, ultimoCusto: true, unidade: true, unidadeCompra: true, fatorConversaoCompra: true }
    })
  ]);

  return {
    fornecedores: fornecedores.map((f) => ({
      id: f.id,
      label: f.nomeFantasia ? `${f.nomeFantasia} (${f.razaoSocial})` : f.razaoSocial
    })),
    produtos: produtos.map((p) => ({
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      ultimoCusto: Number(p.ultimoCusto ?? 0),
      unidade: p.unidade,
      unidadeCompra: p.unidadeCompra,
      fatorConversaoCompra: Number(p.fatorConversaoCompra ?? 1)
    }))
  };
}
