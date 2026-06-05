import { getDevelopmentTenantScope, scopedByTenantCompany } from "@/lib/auth/dev-session";
import { prisma } from "@/lib/db/prisma";
import { formatBrl } from "@/lib/formatters/currency";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StockBalance = {
  produtoId: string;
  sku: string;
  nome: string;
  gtin: string | null;
  codigoOriginal: string | null;
  codigoFabricante: string | null;
  depositoId: string;
  depositoNome: string;
  quantidade: number;
  reservado: number;
  disponivel: number;
  custoMedio: number;
  valorTotalCusto: string;
  minimo: number;
  status: "Em estoque" | "Crítico" | "Zerado";
  statusTone: "success" | "warn" | "danger";
};

export type StockMovement = {
  id: string;
  produtoSku: string;
  produtoNome: string;
  depositoNome: string;
  tipo: string;
  tipoLabel: string;
  quantidade: number;
  saldoDepois: number;
  custoUnitario: number;
  documentoTipo: string | null;
  documentoId: string | null;
  observacoes: string | null;
  data: string;
};

export type DepositoOption = {
  id: string;
  nome: string;
  padrao: boolean;
};

export type InventorySummary = {
  id: string;
  numero: string;
  depositoNome: string;
  descricao: string | null;
  status: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "info" | "mute";
  totalItens: number;
  divergencias: number;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
};

export type InventoryDetail = {
  id: string;
  numero: string;
  depositoNome: string;
  descricao: string | null;
  status: string;
  statusLabel: string;
  statusTone: "success" | "warn" | "danger" | "info" | "mute";
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  itens: InventoryItemDetail[];
};

export type InventoryItemDetail = {
  id: string;
  produtoId: string;
  produtoSku: string;
  produtoNome: string;
  saldoSistema: number;
  saldoContado: number | null;
  diferenca: number | null;
  custoUnitario: number;
  contado: boolean;
  ajustado: boolean;
};

export type ProdutoOption = {
  id: string;
  sku: string;
  nome: string;
  disponivel: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStockStatus(disponivel: number, minimo: number): StockBalance["status"] {
  if (disponivel <= 0) return "Zerado";
  if (minimo > 0 && disponivel <= minimo) return "Crítico";
  return "Em estoque";
}

function getStockTone(status: StockBalance["status"]): StockBalance["statusTone"] {
  if (status === "Zerado") return "danger";
  if (status === "Crítico") return "warn";
  return "success";
}

function tipoMovimentoLabel(tipo: string): string {
  const map: Record<string, string> = {
    ENTRADA: "Entrada",
    SAIDA: "Saída",
    TRANSFERENCIA: "Transferência",
    AJUSTE: "Ajuste",
    ESTORNO: "Estorno",
    RESERVA: "Reserva",
    LIBERACAO_RESERVA: "Liberação Reserva"
  };
  return map[tipo] ?? tipo;
}

function inventarioStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ABERTO: "Aberto",
    EM_CONTAGEM: "Em contagem",
    FINALIZADO: "Finalizado",
    CANCELADO: "Cancelado"
  };
  return map[status] ?? status;
}

function inventarioStatusTone(status: string): InventorySummary["statusTone"] {
  const map: Record<string, InventorySummary["statusTone"]> = {
    ABERTO: "info",
    EM_CONTAGEM: "warn",
    FINALIZADO: "success",
    CANCELADO: "mute"
  };
  return map[status] ?? "mute";
}

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Lista saldos de estoque por produto ativo, agrupando por depósito principal.
 */
export async function listStockBalances(): Promise<StockBalance[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const saldos = await prisma.estoqueSaldo.findMany({
      where: {
        tenantId: scope.tenantId,
        empresaId: scope.empresaId,
        produto: { ativo: true }
      },
      include: {
        produto: {
          select: {
            id: true,
            sku: true,
            nome: true,
            gtin: true,
            codigoOriginal: true,
            codigoFabricante: true,
            custoMedio: true,
            precoCusto: true
          }
        },
        deposito: {
          select: { id: true, nome: true }
        }
      },
      orderBy: [{ produto: { nome: "asc" } }]
    });

    return saldos.map((s) => {
      const qtd = Number(s.quantidade);
      const res = Number(s.reservado);
      const disp = Math.max(qtd - res, 0);
      const min = Number(s.minimo);
      const custo = Number(s.produto.custoMedio ?? s.produto.precoCusto ?? 0);
      const status = getStockStatus(disp, min);

      return {
        produtoId: s.produto.id,
        sku: s.produto.sku,
        nome: s.produto.nome,
        gtin: s.produto.gtin,
        codigoOriginal: s.produto.codigoOriginal,
        codigoFabricante: s.produto.codigoFabricante,
        depositoId: s.deposito.id,
        depositoNome: s.deposito.nome,
        quantidade: qtd,
        reservado: res,
        disponivel: disp,
        custoMedio: custo,
        valorTotalCusto: formatBrl(qtd * custo),
        minimo: min,
        status,
        statusTone: getStockTone(status)
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar saldos de estoque: ${message}`);
  }
}

/**
 * Últimos movimentos de estoque (limite configurável, padrão 100).
 */
export async function listStockMovements(limit = 100): Promise<StockMovement[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const movimentos = await prisma.estoqueMovimento.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
      include: {
        produto: { select: { sku: true, nome: true } },
        deposito: { select: { nome: true } }
      },
      orderBy: { criadoEm: "desc" },
      take: limit
    });

    return movimentos.map((m) => ({
      id: m.id,
      produtoSku: m.produto.sku,
      produtoNome: m.produto.nome,
      depositoNome: m.deposito.nome,
      tipo: m.tipo,
      tipoLabel: tipoMovimentoLabel(m.tipo),
      quantidade: Number(m.quantidade),
      saldoDepois: Number(m.saldoDepois ?? 0),
      custoUnitario: Number(m.custoUnitario ?? 0),
      documentoTipo: m.documentoTipo ?? null,
      documentoId: m.documentoId ?? null,
      observacoes: m.observacoes ?? null,
      data: fmtDate(m.criadoEm) ?? ""
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar movimentações: ${message}`);
  }
}

/**
 * Depósitos ativos da empresa.
 */
export async function listDepositos(): Promise<DepositoOption[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const deps = await prisma.deposito.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId, ativo: true },
      orderBy: [{ padrao: "desc" }, { nome: "asc" }]
    });

    return deps.map((d) => ({ id: d.id, nome: d.nome, padrao: d.padrao }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar depósitos: ${message}`);
  }
}

/**
 * Lista inventários com resumo de itens e divergências.
 */
export async function listInventories(): Promise<InventorySummary[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const inventarios = await prisma.inventario.findMany({
      where: { tenantId: scope.tenantId, empresaId: scope.empresaId },
      include: {
        deposito: { select: { nome: true } },
        itens: {
          select: { saldoSistema: true, saldoContado: true, contado: true }
        }
      },
      orderBy: { criadoEm: "desc" }
    });

    return inventarios.map((inv) => {
      const totalItens = inv.itens.length;
      const divergencias = inv.itens.filter(
        (it) => it.contado && it.saldoContado !== null && Number(it.saldoContado) !== Number(it.saldoSistema)
      ).length;

      return {
        id: inv.id,
        numero: inv.numero,
        depositoNome: inv.deposito.nome,
        descricao: inv.descricao ?? null,
        status: inv.status,
        statusLabel: inventarioStatusLabel(inv.status),
        statusTone: inventarioStatusTone(inv.status),
        totalItens,
        divergencias,
        iniciadoEm: fmtDate(inv.iniciadoEm),
        finalizadoEm: fmtDate(inv.finalizadoEm)
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar inventários: ${message}`);
  }
}

/**
 * Detalhe de um inventário com todos os itens.
 */
export async function getInventoryDetail(id: string): Promise<InventoryDetail | null> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const inv = await prisma.inventario.findFirst({
      where: { id, tenantId: scope.tenantId, empresaId: scope.empresaId },
      include: {
        deposito: { select: { nome: true } },
        itens: {
          include: {
            produto: { select: { sku: true, nome: true } }
          },
          orderBy: { produto: { nome: "asc" } }
        }
      }
    });

    if (!inv) return null;

    return {
      id: inv.id,
      numero: inv.numero,
      depositoNome: inv.deposito.nome,
      descricao: inv.descricao ?? null,
      status: inv.status,
      statusLabel: inventarioStatusLabel(inv.status),
      statusTone: inventarioStatusTone(inv.status),
      iniciadoEm: fmtDate(inv.iniciadoEm),
      finalizadoEm: fmtDate(inv.finalizadoEm),
      itens: inv.itens.map((it) => {
        const sistema = Number(it.saldoSistema);
        const contado = it.saldoContado !== null ? Number(it.saldoContado) : null;
        const diferenca = contado !== null ? contado - sistema : null;

        return {
          id: it.id,
          produtoId: it.produtoId,
          produtoSku: it.produto.sku,
          produtoNome: it.produto.nome,
          saldoSistema: sistema,
          saldoContado: contado,
          diferenca,
          custoUnitario: Number(it.custoUnitario),
          contado: it.contado,
          ajustado: it.ajustado
        };
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar detalhe do inventário: ${message}`);
  }
}

/**
 * Lista produtos ativos com saldo disponível para uso em seletores (ajuste/transferência).
 */
export async function listProdutosOptions(): Promise<ProdutoOption[]> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  try {
    const scope = await getDevelopmentTenantScope();
    const produtos = await prisma.produto.findMany({
      where: { ...scopedByTenantCompany(scope), ativo: true },
      include: {
        saldosEstoque: {
          select: { quantidade: true, reservado: true }
        }
      },
      orderBy: { nome: "asc" }
    });

    return produtos.map((p) => {
      const disponivel = p.saldosEstoque.reduce(
        (acc, s) => acc + Math.max(Number(s.quantidade) - Number(s.reservado), 0),
        0
      );
      return { id: p.id, sku: p.sku, nome: p.nome, disponivel };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Não foi possível carregar produtos: ${message}`);
  }
}
